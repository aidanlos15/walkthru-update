"use client";

import { useState } from "react";
import type { ClipPublic } from "@/lib/types";
import { MUSIC_TRACKS, DEFAULT_MUSIC_ID } from "@/lib/music";
import { Button, LinkButton } from "./ui/Button";

/**
 * The clip-review gate. Every Higgsfield clip is rendered; before we spend the
 * Creatomate stitch we show each clip so the user can watch them, pick the
 * soundtrack, then click next to assemble the final film.
 */
export function ClipReview({
  clips,
  onStitch,
  stitching,
}: {
  clips: ClipPublic[];
  onStitch: (musicId: string) => void;
  stitching: boolean;
}) {
  const [musicId, setMusicId] = useState(DEFAULT_MUSIC_ID);
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-tint p-5 shadow-soft sm:p-6">
        <p className="text-lg font-semibold text-ink">
          Watch the rendered clips
        </p>
        <p className="mt-1.5 text-[14px] text-muted">
          All {clips.length} clip{clips.length === 1 ? "" : "s"} came back from
          Higgsfield. Play each one below, then continue to stitch them into the
          final film.
        </p>
      </div>

      <ol className="grid gap-4 sm:grid-cols-2">
        {clips.map((clip, i) => (
          <li
            key={i}
            className="overflow-hidden rounded-2xl bg-surface shadow-soft"
          >
            <video
              src={clip.url}
              controls
              muted
              playsInline
              preload="metadata"
              className="aspect-video w-full bg-ink object-cover"
            />
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-tint text-[13px] font-semibold text-accent">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-ink">
                  {clip.room}
                </span>
                <span className="block truncate text-[12px] text-muted">
                  {clip.motion} · {clip.caption}
                </span>
              </span>
            </div>
          </li>
        ))}
      </ol>

      <section className="space-y-3">
        <div>
          <p className="text-lg font-semibold text-ink">Pick the soundtrack</p>
          <p className="mt-1 text-[14px] text-muted">
            Laid under the whole film. Tap play to preview each one.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {MUSIC_TRACKS.map((t) => {
            const selected = t.id === musicId;
            return (
              <label
                key={t.id}
                className={`flex cursor-pointer flex-col gap-2 rounded-2xl border p-4 transition-colors ${
                  selected
                    ? "border-accent bg-tint"
                    : "border-line bg-surface hover:border-accent/50"
                }`}
              >
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="soundtrack"
                    checked={selected}
                    onChange={() => setMusicId(t.id)}
                    className="mt-1 accent-[var(--accent,#4f46e5)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-ink">
                      {t.name}
                    </span>
                    <span className="block text-[12px] text-muted">
                      {t.vibe} · {t.artist}
                    </span>
                  </span>
                </span>
                <audio
                  controls
                  preload="none"
                  src={t.file}
                  className="h-9 w-full"
                />
              </label>
            );
          })}
        </div>
      </section>

      <div className="sticky bottom-3 flex flex-col gap-3 rounded-2xl bg-surface p-3 shadow-lift sm:flex-row">
        <Button
          className="flex-1"
          onClick={() => onStitch(musicId)}
          disabled={stitching}
        >
          {stitching
            ? "Starting the edit…"
            : `Next: stitch the ${clips.length === 1 ? "clip" : `${clips.length} clips`} into the film`}
        </Button>
        <LinkButton href="/" variant="ghost">
          Start over
        </LinkButton>
      </div>
    </div>
  );
}
