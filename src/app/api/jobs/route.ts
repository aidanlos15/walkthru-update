import { NextRequest, NextResponse } from "next/server";
import { MAX_IMAGES } from "@/lib/env";
import { createJob, newJobId, toPublic } from "@/lib/jobStore";
import { runPipeline } from "@/lib/pipeline";
import type { IngestMode, Job, SourceImage } from "@/lib/types";

export const runtime = "nodejs";

interface CreateBody {
  mode: IngestMode;
  /** photos: array of data URLs (or hosted URLs). */
  images?: SourceImage[];
  /** link: an airbnb.com listing URL. */
  airbnbUrl?: string;
}

const AIRBNB_RE = /^https?:\/\/(www\.)?airbnb\.[a-z.]+\/rooms\/\d+/i;

export async function POST(req: NextRequest) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.mode !== "photos" && body.mode !== "link") {
    return NextResponse.json(
      { error: "mode must be 'photos' or 'link'." },
      { status: 400 },
    );
  }

  let images: SourceImage[] = [];
  let airbnbUrl: string | undefined;

  if (body.mode === "photos") {
    images = Array.isArray(body.images) ? body.images : [];
    if (images.length === 0) {
      return NextResponse.json(
        { error: "Add at least one photo." },
        { status: 400 },
      );
    }
    if (images.length > MAX_IMAGES) {
      return NextResponse.json(
        { error: `Max ${MAX_IMAGES} photos per tour.` },
        { status: 400 },
      );
    }
  } else {
    airbnbUrl = body.airbnbUrl?.trim();
    if (!airbnbUrl || !AIRBNB_RE.test(airbnbUrl)) {
      return NextResponse.json(
        { error: "That doesn't look like an Airbnb listing URL." },
        { status: 400 },
      );
    }
  }

  const job: Job = {
    id: newJobId(),
    mode: body.mode,
    status: "queued",
    createdAt: Date.now(),
    images,
    airbnbUrl,
  };
  createJob(job);

  // Fire-and-forget: localhost has no serverless timeout, so the long-running
  // pipeline runs in-process while the client polls the status endpoint.
  void runPipeline(job.id);

  return NextResponse.json(toPublic(job), { status: 201 });
}
