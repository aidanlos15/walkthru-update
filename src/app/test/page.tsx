"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { PageShell } from "@/components/PageShell";
import { Dropzone } from "@/components/Dropzone";
import { ThumbGrid, type LocalImage } from "@/components/ThumbGrid";
import { Button } from "@/components/ui/Button";
import { toJpegDataUrl } from "@/lib/browserImage";
import type { ClassifyResult, RoomGroup } from "@/lib/types";

// Mirrors MAX_IMAGES in src/lib/env.ts (client components can't read it).
const MAX = 100;

type Item = { img: LocalImage; file: File };

/**
 * Test tool: drop images and let Claude sort them into rooms, flagging
 * open-plan spaces that flow into each other. Same understanding the director
 * uses; here it's surfaced on its own so you can sanity-check the grouping
 * before committing to a full tour.
 */
export default function TestPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState(false);
  // Snapshot of the images that produced `groups`, so the result thumbnails map
  // back to the right previews even if the picker is edited afterwards.
  const [result, setResult] = useState<{
    items: Item[];
    groups: RoomGroup[];
  } | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    return () => items.forEach((it) => URL.revokeObjectURL(it.img.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(files: File[]) {
    setError(null);
    setItems((prev) => {
      const room = MAX - prev.length;
      if (room <= 0) {
        setError(`You can add up to ${MAX} photos.`);
        return prev;
      }
      const accepted = files.slice(0, room);
      if (files.length > room) {
        setError(`Only the first ${room} photo(s) were added (max ${MAX}).`);
      }
      const next = accepted.map((file) => ({
        file,
        img: { id: `img_${idRef.current++}`, url: URL.createObjectURL(file) },
      }));
      return [...prev, ...next];
    });
  }

  function remove(id: string) {
    setItems((prev) => {
      const gone = prev.find((it) => it.img.id === id);
      if (gone) URL.revokeObjectURL(gone.img.url);
      return prev.filter((it) => it.img.id !== id);
    });
  }

  async function sort() {
    if (items.length === 0 || sorting) return;
    const snapshot = items;
    setSorting(true);
    setError(null);
    setResult(null);
    try {
      const images = await Promise.all(
        snapshot.map(async (it) => ({ url: await toJpegDataUrl(it.file) })),
      );
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ images }),
      });
      const data = (await res.json()) as ClassifyResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not sort the photos.");
      setResult({ items: snapshot, groups: data.groups });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSorting(false);
    }
  }

  return (
    <PageShell
      eyebrow="Test · room sorter"
      heading="Sort photos by room"
      sub="Drop in photos and Claude groups them by space, flagging open-plan areas that flow into each other."
      back={{ href: "/", label: "Back" }}
    >
      <div className="space-y-6">
        <Dropzone onFiles={addFiles} disabled={sorting} />

        {items.length > 0 && (
          <div className="flex items-center justify-between text-sm text-muted">
            <span>
              {items.length} / {MAX} photos
            </span>
            <button
              onClick={() => {
                items.forEach((it) => URL.revokeObjectURL(it.img.url));
                setItems([]);
                setResult(null);
              }}
              className="font-medium text-muted transition-colors hover:text-accent"
            >
              Clear all
            </button>
          </div>
        )}

        <ThumbGrid images={items.map((it) => it.img)} onRemove={remove} />

        {error && (
          <p className="rounded-xl bg-tint px-4 py-3 text-sm text-accent600 shadow-soft">
            {error}
          </p>
        )}

        <div className="flex justify-end pt-2">
          <Button
            size="lg"
            disabled={items.length === 0 || sorting}
            onClick={sort}
          >
            {sorting ? "Sorting…" : "Sort by room"}
          </Button>
        </div>

        {result && <Results {...result} />}
      </div>
    </PageShell>
  );
}

function Results({ items, groups }: { items: Item[]; groups: RoomGroup[] }) {
  return (
    <div className="space-y-6 border-t border-line pt-8">
      <p className="text-sm text-muted">
        {groups.length} room{groups.length === 1 ? "" : "s"} detected.
      </p>
      <div className="space-y-8">
        {groups.map((g, gi) => (
          <div key={gi} className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-lg font-semibold text-ink">{g.room}</h3>
              <span className="text-xs text-muted">
                {g.imageIndexes.length} photo
                {g.imageIndexes.length === 1 ? "" : "s"}
              </span>
              {g.openPlanWith.length > 0 && (
                <span className="rounded-full bg-tint px-2.5 py-1 text-xs font-medium text-accent">
                  Open plan with {g.openPlanWith.join(", ")}
                </span>
              )}
            </div>
            {g.layoutNotes && (
              <p className="text-sm text-muted">{g.layoutNotes}</p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {g.imageIndexes.map((idx) => {
                const it = items[idx];
                if (!it) return null;
                return (
                  <div
                    key={it.img.id}
                    className="relative aspect-[4/3] overflow-hidden rounded-xl bg-tint shadow-soft"
                  >
                    <Image
                      src={it.img.url}
                      alt={g.room}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
