import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob, toPublic } from "@/lib/jobStore";

export const runtime = "nodejs";

/**
 * Edit one planned shot's render prompt while the job is paused at the review
 * gate. The body is `{ index, prompt }`; the new text is stored on that shot's
 * `renderPrompt` and is what gets sent to Higgsfield verbatim once confirmed.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  if (job.status !== "awaiting_confirmation") {
    return NextResponse.json(
      { error: `Job is ${job.status}, prompts can no longer be edited.` },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    index?: unknown;
    prompt?: unknown;
  } | null;
  const index = Number(body?.index);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

  const shots = job.shots ?? [];
  if (!Number.isInteger(index) || index < 0 || index >= shots.length) {
    return NextResponse.json({ error: "Invalid shot index." }, { status: 400 });
  }
  if (!prompt) {
    return NextResponse.json({ error: "Prompt cannot be empty." }, { status: 400 });
  }

  const next = shots.map((s, i) =>
    i === index ? { ...s, renderPrompt: prompt } : s,
  );
  const updated = updateJob(jobId, { shots: next });
  if (!updated) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  return NextResponse.json(toPublic(updated));
}
