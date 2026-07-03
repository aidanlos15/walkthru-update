import { NextRequest, NextResponse } from "next/server";
import { getJob, toPublic, updateJob } from "@/lib/jobStore";
import { directPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";

interface KeepEntry {
  /** Index into the scraped photo array. */
  index?: number;
  /** The user-confirmed room for this photo (from the room board). */
  room?: string;
}

interface PhotosBody {
  /**
   * Photos the user chose to keep: plain indexes, or `{index, room}` entries
   * from the room board so corrections become the image labels the director
   * builds on.
   */
  keep?: Array<number | KeepEntry>;
}

/**
 * Confirm the scraped listing photos and kick off the director. Only valid
 * while the job is paused at the photo-review gate. An optional `keep` array
 * drops any photos the user removed on the review screen and carries their
 * confirmed room labels.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  if (job.status !== "awaiting_photos") {
    return NextResponse.json(
      { error: `Job is ${job.status}, not awaiting photo review.` },
      { status: 409 },
    );
  }

  let body: PhotosBody = {};
  try {
    body = (await req.json()) as PhotosBody;
  } catch {
    // No body = keep every photo.
  }

  let images = job.images;
  if (Array.isArray(body.keep)) {
    const seen = new Set<number>();
    images = body.keep
      .map((entry) =>
        typeof entry === "number"
          ? { index: entry, room: undefined }
          : { index: Number(entry?.index), room: entry?.room },
      )
      .filter(
        ({ index }) =>
          Number.isInteger(index) &&
          index >= 0 &&
          index < job.images.length &&
          !seen.has(index) &&
          (seen.add(index), true),
      )
      .map(({ index, room }) => ({
        ...job.images[index],
        // A confirmed room from the review board overrides the scraper label.
        label:
          typeof room === "string" && room.trim()
            ? room.trim()
            : job.images[index].label,
      }));
  }
  if (images.length === 0) {
    return NextResponse.json(
      { error: "Keep at least one photo." },
      { status: 400 },
    );
  }
  updateJob(jobId, { images });
  console.log(
    `[photos] job ${jobId}: kept ${images.length}/${job.images.length}` +
      ` (rooms: ${[...new Set(images.map((i) => i.label ?? "-"))].join(", ")})`,
  );

  // Fire-and-forget, same as the other phases: localhost has no serverless
  // timeout, so directing runs in-process while the client polls.
  void directPipeline(jobId);

  return NextResponse.json(toPublic({ ...job, images, status: "directing" }));
}
