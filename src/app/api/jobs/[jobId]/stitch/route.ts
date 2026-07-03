import { NextRequest, NextResponse } from "next/server";
import { getJob, toPublic, updateJob } from "@/lib/jobStore";
import { stitchPipeline } from "@/lib/pipeline";
import { musicTrack } from "@/lib/music";

export const runtime = "nodejs";

/**
 * Confirm the rendered clips and kick off phase three of the pipeline (stitch).
 * Only valid while the job is paused at the clip-review gate. The body may
 * carry the soundtrack chosen on the review screen: `{ musicId }`.
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
  if (job.status !== "awaiting_stitch") {
    return NextResponse.json(
      { error: `Job is ${job.status}, not awaiting stitch.` },
      { status: 409 },
    );
  }

  let musicId: string | undefined;
  try {
    const body = (await req.json()) as { musicId?: string };
    if (typeof body.musicId === "string") musicId = body.musicId;
  } catch {
    // No body = default soundtrack.
  }
  const track = musicTrack(musicId);
  updateJob(jobId, { musicId: track.id });
  console.log(`[stitch] job ${jobId}: soundtrack "${track.name}" (${track.id})`);

  // Fire-and-forget, same as the earlier phases: localhost has no serverless
  // timeout, so stitching runs in-process while the client polls.
  void stitchPipeline(jobId);

  return NextResponse.json(toPublic({ ...job, status: "stitching" }));
}
