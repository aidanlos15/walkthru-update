"use client";

import {
  STEP_ORDER,
  type JobStatus,
  type RenderProgress,
  type RenderStage,
} from "@/lib/types";
import { CheckIcon } from "./icons";

const LABELS: Record<string, string> = {
  scraping: "Scraping listing",
  directing: "Directing shots",
  rendering: "Rendering clips",
  stitching: "Stitching film",
};

const STAGE_LABELS: Record<RenderStage, string> = {
  uploading: "uploading photo",
  queued: "queued",
  in_progress: "generating",
  completed: "done",
};

/** Human sub-line for the rendering step, e.g. "Clip 1 of 3 · generating". */
function renderDetail(p: RenderProgress): string {
  if (p.completed >= p.total && p.total > 0) return "Finishing up…";
  const cur = p.current;
  if (!cur) return `Rendering ${p.total} clip${p.total === 1 ? "" : "s"}…`;
  return `Clip ${cur.index} of ${p.total} · ${STAGE_LABELS[cur.stage]}`;
}

/** Which pipeline steps to show. Photo flow skips scraping. */
function stepsFor(mode: "photos" | "link"): JobStatus[] {
  return mode === "link"
    ? STEP_ORDER
    : STEP_ORDER.filter((s) => s !== "scraping");
}

const rank = (s: JobStatus) => STEP_ORDER.indexOf(s);

interface StepperProps {
  status: JobStatus;
  mode: "photos" | "link";
  renderProgress?: RenderProgress;
}

export function Stepper({ status, mode, renderProgress }: StepperProps) {
  const steps = stepsFor(mode);
  // "done" ranks past every step; "queued"/"error" rank before them.
  const current = status === "done" ? STEP_ORDER.length : rank(status);

  return (
    <ol className="space-y-3">
      {steps.map((step) => {
        const idx = rank(step);
        const done = current > idx;
        const active = current === idx;
        return (
          <li
            key={step}
            className={`flex items-center gap-4 rounded-xl p-4 shadow-soft transition-colors ${
              active ? "bg-tint" : "bg-surface"
            }`}
          >
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-medium transition-colors ${
                done
                  ? "bg-success text-white"
                  : active
                    ? "bg-accent text-white"
                    : "bg-tint text-muted"
              }`}
            >
              {done ? (
                <CheckIcon />
              ) : active ? (
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
              ) : (
                idx + 1
              )}
            </span>
            <div className="flex-1">
              <p
                className={`text-[15px] font-medium ${
                  active ? "text-ink" : done ? "text-ink" : "text-muted"
                }`}
              >
                {LABELS[step]}
              </p>
              {active && step === "rendering" && renderProgress && (
                <p className="mt-0.5 text-[13px] text-muted">
                  {renderDetail(renderProgress)}
                </p>
              )}
            </div>
            {active && (
              <span className="text-xs font-medium uppercase tracking-wide text-accent">
                Working…
              </span>
            )}
            {done && (
              <span className="text-xs font-medium uppercase tracking-wide text-success">
                Done
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
