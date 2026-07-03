import type { Job, JobPublic } from "./types";

/**
 * In-memory job state. No DB, no queue: a Map keyed by jobId.
 *
 * Next dev/HMR can re-evaluate modules, wiping module-scope state. We stash the
 * Map on globalThis so it survives hot reloads within a single server process.
 */
const globalForStore = globalThis as unknown as {
  __walkthruJobs?: Map<string, Job>;
};

const jobs: Map<string, Job> =
  globalForStore.__walkthruJobs ?? new Map<string, Job>();

if (!globalForStore.__walkthruJobs) {
  globalForStore.__walkthruJobs = jobs;
}

/** Simple unique id without extra deps (no crypto-strength needed for a demo). */
export function newJobId(): string {
  return (
    "job_" +
    Math.abs(
      Array.from(String(process.hrtime.bigint())).reduce(
        (h, c) => (h * 31 + c.charCodeAt(0)) | 0,
        7,
      ),
    ).toString(36) +
    "_" +
    process.hrtime.bigint().toString(36).slice(-5)
  );
}

export function createJob(job: Job): Job {
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, patch: Partial<Job>): Job | undefined {
  const existing = jobs.get(id);
  if (!existing) return undefined;
  const next = { ...existing, ...patch };
  jobs.set(id, next);
  return next;
}

/** Strip internal fields before sending to the client. */
export function toPublic(job: Job): JobPublic {
  return {
    id: job.id,
    mode: job.mode,
    status: job.status,
    title: job.title,
    videoUrl: job.videoUrl,
    error: job.error,
    shotCount: job.shots?.length,
    renderProgress: job.renderProgress,
    clips: job.shots
      ?.filter((s) => s.clipUrl)
      .map((s) => ({
        url: s.clipUrl!,
        room: s.room,
        motion: s.motion,
        caption: s.caption,
        openPlanWith: s.openPlanWith,
        prompt: s.renderPrompt,
      })),
    // Surfaced so the photo-review screen can show what the scraper found
    // before the director runs.
    photos: job.status === "awaiting_photos" ? job.images : undefined,
    // Surfaced so the review screen can show the prompts before rendering. The
    // render prompt is computed at the end of the director step.
    plannedShots: job.shots
      ?.filter((s) => s.renderPrompt)
      .map((s) => ({
        room: s.room,
        motion: s.motion,
        caption: s.caption,
        openPlanWith: s.openPlanWith,
        prompt: s.renderPrompt!,
      })),
  };
}
