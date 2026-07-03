"use client";

import { useEffect, useRef, useState } from "react";
import type { PlannedShot } from "@/lib/types";
import { Button, LinkButton } from "./ui/Button";

/**
 * The review gate. Once the director has planned every shot, we show the exact
 * prompt that will go to Higgsfield for each one so the user can read them over,
 * and now edit them, before anything is sent off and billed. Each box is one
 * clip's prompt; Higgsfield animates one photo per clip and can't see the
 * others, so every shot has its own self-contained prompt. Confirm sends the
 * (possibly edited) prompts and kicks off the render.
 */
export function PromptReview({
  jobId,
  shots,
  onConfirm,
  confirming,
}: {
  jobId: string;
  shots: PlannedShot[];
  onConfirm: () => void;
  confirming: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-tint p-5 shadow-soft sm:p-6">
        <p className="text-lg font-semibold text-ink">
          Read over the render prompts
        </p>
        <p className="mt-1.5 text-[14px] text-muted">
          This is exactly what we&apos;ll send to Higgsfield to generate each
          clip: {shots.length} shot{shots.length === 1 ? "" : "s"} in all, one
          prompt per clip. Tap any prompt to edit it, then confirm to start
          rendering.
        </p>
      </div>

      <ol className="space-y-3">
        {shots.map((shot, i) => (
          <PromptCard key={i} jobId={jobId} index={i} shot={shot} />
        ))}
      </ol>

      <div className="sticky bottom-3 flex flex-col gap-3 rounded-2xl bg-surface p-3 shadow-lift sm:flex-row">
        <Button className="flex-1" onClick={onConfirm} disabled={confirming}>
          {confirming
            ? "Sending to Higgsfield…"
            : `Looks good, render ${shots.length} clip${
                shots.length === 1 ? "" : "s"
              }`}
        </Button>
        <LinkButton href="/" variant="ghost">
          Start over
        </LinkButton>
      </div>
    </div>
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";

function PromptCard({
  jobId,
  index,
  shot,
}: {
  jobId: string;
  index: number;
  shot: PlannedShot;
}) {
  const [open, setOpen] = useState(index === 0);
  // Local draft of the prompt so typing is instant; the saved server value is
  // what actually gets sent to Higgsfield on confirm.
  const [draft, setDraft] = useState(shot.prompt);
  const [saved, setSaved] = useState(shot.prompt);
  const [state, setState] = useState<SaveState>("idle");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirty = draft.trim() !== saved.trim();

  // If the parent re-fetches the job and the prompt changes underneath us while
  // we have no local edits, adopt the new value.
  useEffect(() => {
    if (!dirty && state !== "saving") {
      setDraft(shot.prompt);
      setSaved(shot.prompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.prompt]);

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  async function save() {
    const text = draft.trim();
    if (!text || text === saved.trim()) return;
    setState("saving");
    try {
      const res = await fetch(`/api/jobs/${jobId}/prompt`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index, prompt: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't save.");
      }
      setSaved(text);
      setState("saved");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
    }
  }

  return (
    <li className="rounded-2xl bg-surface shadow-soft">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-tint"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-tint text-[13px] font-semibold text-accent">
          {index + 1}
        </span>
        <span className="flex-1">
          <span className="block text-[15px] font-medium text-ink">
            {shot.room}
          </span>
          <span className="block text-[12px] text-muted">
            {shot.motion}
            {shot.openPlanWith?.length
              ? ` · open-plan with ${shot.openPlanWith.join(", ")}`
              : ""}
            {dirty ? " · edited (unsaved)" : ""}
          </span>
        </span>
        <span className="text-[12px] font-medium uppercase tracking-wide text-accent">
          {open ? "Hide" : "Edit"}
        </span>
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="mx-4 mb-4 space-y-2">
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (state !== "idle") setState("idle");
              }}
              onBlur={save}
              rows={Math.min(14, Math.max(5, draft.split("\n").length + 3))}
              spellCheck={false}
              className="block w-full resize-y whitespace-pre-wrap rounded-xl bg-bg p-3 font-mono text-[12.5px] leading-relaxed text-ink outline-none ring-1 ring-inset ring-black/5 focus:ring-2 focus:ring-accent"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-muted">
                {state === "saving"
                  ? "Saving…"
                  : state === "saved"
                    ? "Saved ✓"
                    : state === "error"
                      ? "Couldn't save — try again"
                      : dirty
                        ? "Unsaved changes"
                        : "This exact text is sent to Higgsfield"}
              </span>
              <button
                type="button"
                onClick={save}
                disabled={!dirty || state === "saving"}
                className="rounded-full bg-tint px-3 py-1.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent hover:text-white disabled:opacity-40 disabled:hover:bg-tint disabled:hover:text-accent"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
