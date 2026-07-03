"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { ProgressBar } from "@/components/ProgressBar";
import { ThinkingStream } from "@/components/ThinkingStream";
import { PromptReview } from "@/components/PromptReview";
import { ClipReview } from "@/components/ClipReview";
import { PhotoReview } from "@/components/PhotoReview";
import { Button, LinkButton } from "@/components/ui/Button";
import type { IngestMode, JobPublic, JobStatus, RenderProgress } from "@/lib/types";

const POLL_MS = 3000;

/**
 * Rough 0..1 progress for the top bar. Maps the current step to its slice of the
 * pipeline and, during rendering, folds in per-clip progress. Capped below 100%
 * so the bar never claims to be finished before we redirect to the result.
 */
function computeProgress(
  status: JobStatus,
  mode: IngestMode,
  rp?: RenderProgress,
): number {
  const steps: JobStatus[] =
    mode === "link"
      ? ["scraping", "directing", "rendering", "stitching"]
      : ["directing", "rendering", "stitching"];
  const slice = 1 / steps.length;
  if (status === "done") return 1;
  if (status === "queued") return 0.03;
  // Paused for review: scraping is complete, directing hasn't started.
  if (status === "awaiting_photos") {
    const r = steps.indexOf("directing");
    return r < 0 ? 0.2 : r * slice;
  }
  // Paused for review: directing is complete, rendering hasn't started.
  if (status === "awaiting_confirmation") {
    const r = steps.indexOf("rendering");
    return r < 0 ? 0.4 : r * slice;
  }
  // Paused for review: every clip is rendered, stitching hasn't started.
  if (status === "awaiting_stitch") {
    const r = steps.indexOf("stitching");
    return r < 0 ? 0.7 : r * slice;
  }
  const idx = steps.indexOf(status);
  if (idx < 0) return 0.03;
  let frac = idx * slice;
  if (status === "rendering" && rp && rp.total > 0) {
    frac += (rp.completed / rp.total) * slice;
  } else {
    frac += slice * 0.45; // assume we're partway through the current step
  }
  return Math.min(0.97, frac);
}

export default function ProcessPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = use(params);
  const router = useRouter();
  const [job, setJob] = useState<JobPublic | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Job not found.");
        }
        const data: JobPublic = await res.json();
        if (cancelled) return;
        setJob(data);

        if (data.status === "done") {
          router.replace(`/result/${jobId}`);
          return;
        }
        if (data.status === "error") return; // stop polling
        // At a review gate the job only advances via this page's own button,
        // so poll slowly — the awaiting_photos payload re-sends every photo
        // (multi-MB data URLs for uploads) on each poll.
        const gated =
          data.status === "awaiting_photos" ||
          data.status === "awaiting_confirmation" ||
          data.status === "awaiting_stitch";
        timer.current = setTimeout(poll, gated ? POLL_MS * 5 : POLL_MS);
      } catch (e) {
        if (cancelled) return;
        setFetchError(e instanceof Error ? e.message : "Lost connection.");
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [jobId, router]);

  // A ticking elapsed clock reassures the user the app is alive during the
  // multi-minute render, even when a single step sits "Working…" for a while.
  useEffect(() => {
    const done = job?.status === "done" || job?.status === "error";
    if (done) return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [job?.status]);

  // Confirm one review gate: POSTs the given action route, then polling takes
  // over. Used for the photo, prompt and clip review gates.
  async function handleGate(
    action: "photos" | "confirm" | "stitch",
    fallback: string,
    body?: unknown,
  ) {
    setConfirming(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/${action}`, {
        method: "POST",
        ...(body !== undefined
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? fallback);
      }
      const data: JobPublic = await res.json();
      setJob(data); // optimistically flip to the next step
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : fallback);
    } finally {
      setConfirming(false);
    }
  }

  const mode = job?.mode ?? "photos";
  const errored = job?.status === "error" || fetchError;
  const awaiting = job?.status === "awaiting_confirmation";
  const awaitingStitch = job?.status === "awaiting_stitch";
  const awaitingPhotos = job?.status === "awaiting_photos";
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const elapsedLabel = `${mins}:${secs.toString().padStart(2, "0")}`;

  return (
    <PageShell
      eyebrow="Building your tour"
      heading={job?.title ?? "Directing your walk-through"}
      sub={
        awaitingPhotos
          ? mode === "link"
            ? "The listing is scraped. Check the photos below, then continue to direct the tour."
            : "Your photos are in. Sort them below, then continue to direct the tour."
          : awaiting
            ? "Here's the plan. Read over the prompts below, then confirm to render."
            : awaitingStitch
              ? "Every clip is rendered. Watch them below, then continue to the final edit."
              : "Rendering can take several minutes per room: keep this tab open."
      }
      back={{ href: "/", label: "Cancel" }}
    >
      {errored ? (
        <div className="space-y-5">
          <div className="rounded-2xl bg-tint p-6 shadow-soft">
            <p className="text-xl font-semibold text-ink">Something broke</p>
            <p className="mt-2 text-[15px] text-muted">
              {job?.error ?? fetchError}
            </p>
          </div>
          <div className="flex gap-3">
            <LinkButton href="/">Start over</LinkButton>
            <Button variant="ghost" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <ProgressBar
            value={computeProgress(
              job?.status ?? "queued",
              mode,
              job?.renderProgress,
            )}
          />
          <ThinkingStream
            status={job?.status ?? "queued"}
            mode={mode}
            renderProgress={job?.renderProgress}
          />
          {awaitingPhotos && job?.photos?.length ? (
            <PhotoReview
              photos={job.photos}
              mode={mode}
              onContinue={(keep) =>
                handleGate("photos", "Couldn't start the director.", { keep })
              }
              continuing={confirming}
            />
          ) : awaiting && job?.plannedShots?.length ? (
            <PromptReview
              jobId={jobId}
              shots={job.plannedShots}
              onConfirm={() =>
                handleGate("confirm", "Couldn't start rendering.")
              }
              confirming={confirming}
            />
          ) : awaitingStitch && job?.clips?.length ? (
            <ClipReview
              clips={job.clips}
              onStitch={(musicId) =>
                handleGate("stitch", "Couldn't start the stitch.", { musicId })
              }
              stitching={confirming}
            />
          ) : (
            <p className="text-center text-[13px] tabular-nums text-muted">
              Elapsed {elapsedLabel}
            </p>
          )}
        </div>
      )}
    </PageShell>
  );
}
