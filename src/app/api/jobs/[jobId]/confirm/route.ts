import { NextRequest, NextResponse } from "next/server";
import { getJob, toPublic } from "@/lib/jobStore";
import { resumePipeline } from "@/lib/pipeline";

export const runtime = "nodejs";

/**
 * Confirm the planned render prompts and kick off phase two of the pipeline
 * (render + stitch). Only valid while the job is paused at the review gate.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  if (job.status !== "awaiting_confirmation") {
    return NextResponse.json(
      { error: `Job is ${job.status}, not awaiting confirmation.` },
      { status: 409 },
    );
  }

  // Fire-and-forget, same as the initial pipeline kickoff: localhost has no
  // serverless timeout, so rendering runs in-process while the client polls.
  void resumePipeline(jobId);

  return NextResponse.json(toPublic({ ...job, status: "rendering" }));
}
