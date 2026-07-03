"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { VideoPlayer } from "@/components/VideoPlayer";
import { LinkButton } from "@/components/ui/Button";
import type { ClipPublic, JobPublic } from "@/lib/types";

export default function ResultPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = use(params);
  const [job, setJob] = useState<JobPublic | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Job not found.");
        setJob(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const hasVideo = !!job?.videoUrl;
  const clips = job?.clips ?? [];
  const done = job?.status === "done";
  const ready = done && (hasVideo || clips.length > 0);

  return (
    <PageShell
      eyebrow={hasVideo ? "Your tour is ready" : "Your clips are ready"}
      heading={job?.title ?? "Your Walkthru tour"}
      sub={
        hasVideo
          ? "Play it, download the mp4, or share the link."
          : "Each room, animated. Stitching into one film comes next."
      }
      back={{ href: "/", label: "Home" }}
    >
      {error ? (
        <p className="rounded-xl bg-tint px-4 py-3 text-sm text-accent600 shadow-soft">
          {error}
        </p>
      ) : !job ? (
        <div className="aspect-video w-full animate-pulse rounded-2xl bg-tint" />
      ) : !ready ? (
        <div className="space-y-4">
          <p className="text-[15px] text-muted">This tour isn't finished yet.</p>
          <LinkButton href={`/process/${jobId}`}>Back to progress</LinkButton>
        </div>
      ) : hasVideo ? (
        <VideoPlayer src={job.videoUrl!} title={job.title} />
      ) : (
        <ClipGrid clips={clips} />
      )}

      <div className="mt-8">
        <Link
          href="/"
          className="text-sm font-medium text-accent transition-colors hover:text-accent600"
        >
          + Make another
        </Link>
      </div>
    </PageShell>
  );
}

/** Individual per-shot clips, shown when the stitch step is skipped. */
function ClipGrid({ clips }: { clips: ClipPublic[] }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        {clips.length} clip{clips.length === 1 ? "" : "s"}, in tour order.
      </p>
      <ol className="grid gap-5 sm:grid-cols-2">
        {clips.map((clip, i) => (
          <li key={i} className="space-y-3">
            <div className="overflow-hidden rounded-2xl bg-ink shadow-soft">
              <video
                src={clip.url}
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full bg-ink"
              />
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-[15px] font-medium text-ink">
                  {i + 1}. {clip.room}
                </p>
                <p className="text-sm text-muted">{clip.caption}</p>
              </div>
              <span className="shrink-0 rounded-full bg-tint px-2.5 py-1 text-xs font-medium text-accent">
                {clip.motion}
              </span>
            </div>
            {clip.openPlanWith && clip.openPlanWith.length > 0 && (
              <p className="text-xs text-muted">
                Open plan with {clip.openPlanWith.join(", ")}
              </p>
            )}
            {clip.prompt && (
              <details className="group/prompt rounded-xl bg-tint/60 px-3 py-2">
                <summary className="cursor-pointer list-none text-xs font-medium text-accent">
                  Director&rsquo;s prompt to Higgsfield
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted">
                  {clip.prompt}
                </p>
              </details>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
