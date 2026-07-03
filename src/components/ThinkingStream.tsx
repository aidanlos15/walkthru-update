"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  STEP_ORDER,
  type IngestMode,
  type JobStatus,
  type RenderProgress,
  type RenderStage,
} from "@/lib/types";
import { CheckIcon } from "./icons";

/**
 * The processing pipeline is only a handful of real steps, but each one can sit
 * for minutes. This renders one "main box" per step: the active step expands
 * open and streams a Claude-style feed of plausible micro-tasks; when the step
 * finishes the box animates closed into a pill, and the next box opens. It
 * doubles as the step tracker, so it replaces the old flat Stepper.
 */

const LABELS: Record<string, string> = {
  scraping: "Reading the listing",
  directing: "Directing the shoot",
  rendering: "Rendering the clips",
  stitching: "Editing the film",
};

// Micro-tasks the model plausibly runs inside each real step. Each pool is
// strictly scoped to what that step actually does, so a scrape never claims to
// be rendering and a render never claims to be reading Airbnb.
const POOLS: Record<string, string[]> = {
  // Job accepted, pipeline not started yet: neutral prep only.
  queued: [
    "Checking the photo set",
    "Setting up the job",
    "Getting everything in order",
  ],
  // Apify scrape: pulling the photos off the Airbnb listing.
  scraping: [
    "Fetching the listing page",
    "Reading the listing description",
    "Parsing the photo gallery",
    "Skipping floor plans and logos",
    "Downloading full-resolution photos",
    "De-duplicating near-identical shots",
    "Collecting the photo captions",
  ],
  // Claude plans the tour: one clip per confirmed room.
  directing: [
    "Studying the light in every room",
    "Sketching the property's floor plan",
    "Matching angles of the same room",
    "Mapping how the rooms connect",
    "Detecting open-plan spaces",
    "Choosing each room's best opening frame",
    "Assigning a camera move to each room",
    "Matching motion to the shape of each space",
    "Writing one prompt per room",
    "Folding every angle into the room's prompt",
    "Grounding every shot in the real furniture",
    "Sequencing rooms into a natural walk-through",
    "Picking six-word captions",
    "Checking nothing gets invented or relocated",
  ],
  // Higgsfield animates each room's clip.
  rendering: [
    "Uploading the room's photos",
    "Queuing the clip on the render farm",
    "Locking the camera to the planned move",
    "Holding furniture and finishes in place",
    "Rendering at cinematic frame rate",
    "Watching for warped walls and doorways",
    "Preserving the room's real proportions",
    "Checking continuity with the last room",
  ],
  // Creatomate cuts the clips into one film.
  stitching: [
    "Assembling the timeline",
    "Laying down the title card",
    "Cross-fading between rooms",
    "Timing each clip to the pacing",
    "Balancing brightness across shots",
    "Laying the soundtrack under the cut",
    "Encoding the final mp4",
    "Running a last quality pass",
  ],
};

function poolFor(step: JobStatus): string[] {
  return POOLS[step] ?? POOLS.directing;
}

/** Which pipeline steps to show. Photo flow skips scraping. */
function stepsFor(mode: IngestMode): JobStatus[] {
  return mode === "link"
    ? STEP_ORDER
    : STEP_ORDER.filter((s) => s !== "scraping");
}

const STAGE_LABELS: Record<RenderStage, string> = {
  uploading: "uploading photo",
  queued: "queued",
  in_progress: "generating",
  completed: "done",
};

/** Live sub-line for the render box, e.g. "Clip 1 of 3 · generating". */
function renderDetail(p: RenderProgress): string {
  if (p.completed >= p.total && p.total > 0) return "Finishing up…";
  const cur = p.current;
  if (!cur) return `Rendering ${p.total} clip${p.total === 1 ? "" : "s"}…`;
  return `Clip ${cur.index} of ${p.total} · ${STAGE_LABELS[cur.stage]}`;
}

export function ThinkingStream({
  status,
  mode,
  renderProgress,
}: {
  status: JobStatus;
  mode: IngestMode;
  renderProgress?: RenderProgress;
}) {
  const steps = stepsFor(mode);

  // While paused at a review gate the prior step is done but the next hasn't
  // begun, so no box is active: the review panel below takes focus. Maps each
  // gate to the step it pauses before.
  const PAUSE_BEFORE: Partial<Record<JobStatus, JobStatus>> = {
    awaiting_photos: "directing",
    awaiting_confirmation: "rendering",
    awaiting_stitch: "stitching",
  };
  const pausedBefore = PAUSE_BEFORE[status];
  const paused = pausedBefore !== undefined;
  const rank = paused ? steps.indexOf(pausedBefore) : steps.indexOf(status);
  let currentPos: number;
  if (status === "done") currentPos = steps.length;
  else if (status === "queued") currentPos = 0;
  else currentPos = rank < 0 ? 0 : rank;

  return (
    <section aria-hidden className="space-y-2.5">
      <header className="flex items-center gap-2 px-1">
        <span className="flex gap-1">
          <Dot delay="0ms" />
          <Dot delay="200ms" />
          <Dot delay="400ms" />
        </span>
        <span className="text-[13px] font-medium text-muted">
          Thinking it through
        </span>
      </header>

      <ol className="space-y-2.5">
        {steps.map((step, i) => {
          const done = i < currentPos;
          const active = i === currentPos && !paused && status !== "done";
          const detail =
            active && step === "rendering" && renderProgress
              ? renderDetail(renderProgress)
              : undefined;
          return (
            <MainBox
              key={step}
              step={step}
              index={i}
              done={done}
              active={active}
              detail={detail}
            />
          );
        })}
      </ol>
    </section>
  );
}

function MainBox({
  step,
  index,
  done,
  active,
  detail,
}: {
  step: JobStatus;
  index: number;
  done: boolean;
  active: boolean;
  detail?: string;
}) {
  return (
    <li
      // Collapsed radius is pinned to the pill radius at the collapsed row
      // height (badge h-7 = 28px + py-3 = 24px ⇒ 52px tall ⇒ 26px). Pinning it
      // to a concrete px value (not rounded-full's ~9999px) lets border-radius
      // interpolate linearly to rounded-2xl as the box grows, so the corners
      // stay crisp instead of the pill ends looking dragged/warped mid-open.
      className={`bg-surface shadow-soft transition-[border-radius] duration-500 ${
        active ? "rounded-2xl" : "rounded-[26px]"
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <StepBadge index={index} done={done} active={active} />
        <p
          className={`flex-1 text-[15px] font-medium ${
            done || active ? "text-ink" : "text-muted"
          }`}
        >
          {LABELS[step]}
        </p>
        {active ? (
          <Tag className="text-accent">Working…</Tag>
        ) : done ? (
          <Tag className="text-success">Done</Tag>
        ) : (
          <Tag className="text-muted">Queued</Tag>
        )}
      </div>

      {/* Collapsible region: grid-rows 1fr → 0fr gives a smooth open/close. */}
      <div
        className={`grid transition-[grid-template-rows] duration-500 ease-out ${
          active ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3">
            {(active || done) && (
              <ThinkingItems step={step} active={active} detail={detail} />
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

interface Item {
  id: number;
  text: string;
}

const MAX_VISIBLE = 5;

/**
 * The streamed mini "thinking" pills for one step. Runs only while the step is
 * active; when it goes inactive the items freeze in place so the parent box can
 * animate closed with the last few still visible.
 */
function ThinkingItems({
  step,
  active,
  detail,
}: {
  step: JobStatus;
  active: boolean;
  detail?: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const idRef = useRef(0);
  const lastRef = useRef("");

  useEffect(() => {
    if (!active) return; // freeze once the step is no longer active
    let timer: ReturnType<typeof setTimeout>;
    function push() {
      const pool = poolFor(step);
      let text = pool[Math.floor(Math.random() * pool.length)];
      for (let i = 0; i < 5 && text === lastRef.current; i++) {
        text = pool[Math.floor(Math.random() * pool.length)];
      }
      lastRef.current = text;
      idRef.current += 1;
      const id = idRef.current;
      setItems((prev) => [{ id, text }, ...prev].slice(0, MAX_VISIBLE));
      // Vary the cadence so it feels like real, uneven thinking.
      timer = setTimeout(push, 1200 + Math.random() * 1300);
    }
    push();
    return () => clearTimeout(timer);
  }, [active, step]);

  return (
    <ol className="space-y-2 pt-1">
      {detail && <MiniPill text={detail} live emphasis />}
      {items.map((item, i) => (
        <MiniPill
          key={item.id}
          text={item.text}
          live={active && i === 0 && !detail}
        />
      ))}
    </ol>
  );
}

function MiniPill({
  text,
  live,
  emphasis,
}: {
  text: string;
  live: boolean;
  emphasis?: boolean;
}) {
  return (
    <li
      className={`flex animate-rise-in items-center gap-2.5 rounded-full px-3 py-2 text-[13px] ${
        live || emphasis ? "bg-tint text-ink" : "bg-bg text-muted"
      }`}
    >
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
          live ? "bg-accent text-white" : "bg-success text-white"
        }`}
      >
        {live ? (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        ) : (
          <CheckIcon className="h-3 w-3" strokeWidth={3} />
        )}
      </span>
      <span className="flex-1 truncate">
        {text}
        {live && <span className="animate-pulse">…</span>}
      </span>
    </li>
  );
}

function StepBadge({
  index,
  done,
  active,
}: {
  index: number;
  done: boolean;
  active: boolean;
}) {
  return (
    <span
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold transition-colors ${
        done
          ? "bg-success text-white"
          : active
            ? "bg-accent text-white"
            : "bg-tint text-muted"
      }`}
    >
      {done ? (
        <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />
      ) : active ? (
        <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
      ) : (
        index + 1
      )}
    </span>
  );
}

function Tag({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`text-[11px] font-medium uppercase tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-blink rounded-full bg-accent"
      style={{ animationDelay: delay }}
    />
  );
}
