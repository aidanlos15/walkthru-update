"use client";

import { useEffect, useRef, useState } from "react";
import type { ClassifyResult, RoomGroup, SourceImage } from "@/lib/types";
import { Button, LinkButton } from "./ui/Button";
import { RoomBoard, type RoomGroupUI } from "./RoomBoard";

/** One kept photo with its (possibly user-corrected) room label. */
export interface KeptPhoto {
  index: number;
  room: string;
}

/**
 * The photo-review gate (link mode). The scraper has pulled the listing's
 * photos; before the director plans anything we auto-sort them by room (same
 * classify endpoint as the upload page) and show the same room board: drag a
 * photo to another room, rename rooms, X to remove — then click next to hand
 * the corrected rooms to the director.
 */
export function PhotoReview({
  photos,
  mode,
  onContinue,
  continuing,
}: {
  photos: SourceImage[];
  /** "link" = scraped from Airbnb; "photos" = uploaded by the user. */
  mode: "link" | "photos";
  onContinue: (keep: KeptPhoto[]) => void;
  continuing: boolean;
}) {
  const [groups, setGroups] = useState<RoomGroupUI[]>([]);
  const [sorting, setSorting] = useState(true);
  const [sortNote, setSortNote] = useState<string | null>(null);
  const groupIdRef = useRef(0);
  // Ids are just the photo's index as a string; removal = dropping the id.
  const images = photos.map((p, i) => ({ id: String(i), url: p.url }));

  // Auto-sort once on mount. Falls back to the scraper's own captions (or one
  // "All photos" group) if the classifier is unavailable.
  useEffect(() => {
    let cancelled = false;

    function fallbackGroups(): RoomGroupUI[] {
      const byLabel = new Map<string, string[]>();
      photos.forEach((p, i) => {
        const room = p.label?.trim() || "All photos";
        byLabel.set(room, [...(byLabel.get(room) ?? []), String(i)]);
      });
      return Array.from(byLabel, ([room, imageIds]) => ({
        id: `grp_${groupIdRef.current++}`,
        room,
        imageIds,
      }));
    }

    async function sort() {
      try {
        const res = await fetch("/api/classify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ images: photos }),
        });
        const data = (await res.json()) as ClassifyResult & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Could not sort.");
        if (cancelled) return;
        setGroups(
          (data.groups as RoomGroup[]).map((g) => ({
            id: `grp_${groupIdRef.current++}`,
            room: g.room,
            imageIds: g.imageIndexes.map(String),
          })),
        );
      } catch {
        if (cancelled) return;
        setGroups(fallbackGroups());
        setSortNote(
          mode === "link"
            ? "Couldn't auto-sort the photos — they're grouped by the listing's own captions instead. Drag any photo to fix."
            : "Couldn't auto-sort the photos — drag them into rooms yourself, or reload to retry.",
        );
      } finally {
        if (!cancelled) setSorting(false);
      }
    }

    void sort();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function remove(id: string) {
    setGroups((prev) =>
      prev
        .map((g) => ({ ...g, imageIds: g.imageIds.filter((x) => x !== id) }))
        .filter((g) => g.imageIds.length > 0 || g.pinned),
    );
  }

  function move(imageId: string, toGroupId: string | "new") {
    setGroups((prev) => {
      const from = prev.find((g) => g.imageIds.includes(imageId));
      if (!from || from.id === toGroupId) return prev;
      let next = prev.map((g) => ({
        ...g,
        imageIds: g.imageIds.filter((x) => x !== imageId),
      }));
      if (toGroupId === "new") {
        next.push({
          id: `grp_${groupIdRef.current++}`,
          room: "New room",
          imageIds: [imageId],
        });
      } else {
        next = next.map((g) =>
          g.id === toGroupId ? { ...g, imageIds: [...g.imageIds, imageId] } : g,
        );
      }
      return next.filter((g) => g.imageIds.length > 0 || g.pinned);
    });
  }

  function rename(groupId: string, room: string) {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, room } : g)),
    );
  }

  // A user-added room: stays while empty (pinned) so it can be named and
  // filled by dragging.
  function addRoom() {
    setGroups((prev) => [
      ...prev,
      {
        id: `grp_${groupIdRef.current++}`,
        room: "New room",
        imageIds: [],
        pinned: true,
      },
    ]);
  }

  function removeGroup(groupId: string) {
    setGroups((prev) =>
      prev.filter((g) => g.id !== groupId || g.imageIds.length > 0),
    );
  }

  const kept: KeptPhoto[] = groups.flatMap((g) =>
    g.imageIds.map((id) => ({ index: Number(id), room: g.room.trim() })),
  );

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-tint p-5 shadow-soft sm:p-6">
        <p className="text-lg font-semibold text-ink">
          {mode === "link"
            ? "Here's what we found on the listing"
            : "Here are your photos"}
        </p>
        <p className="mt-1.5 text-[14px] text-muted">
          {photos.length} photo{photos.length === 1 ? "" : "s"}{" "}
          {mode === "link" ? "scraped from Airbnb" : "uploaded"}, sorted by
          room. Drag any photo to another room if we got it wrong, rename
          rooms, and remove photos you don&apos;t want — then continue and the
          director will plan the shots.
        </p>
      </div>

      <RoomBoard
        groups={groups}
        images={images}
        pendingIds={sorting ? images.map((img) => img.id) : []}
        onRemove={remove}
        onMove={move}
        onRename={rename}
        onAddRoom={addRoom}
        onRemoveGroup={removeGroup}
      />

      {sortNote && (
        <p className="rounded-xl bg-tint px-4 py-3 text-sm text-accent600 shadow-soft">
          {sortNote}
        </p>
      )}

      <div className="sticky bottom-3 flex flex-col gap-3 rounded-2xl bg-surface p-3 shadow-lift sm:flex-row">
        <Button
          className="flex-1"
          onClick={() => onContinue(kept)}
          disabled={continuing || sorting || kept.length === 0}
        >
          {continuing
            ? "Handing to the director…"
            : sorting
              ? "Sorting rooms…"
              : kept.length === 0
                ? "Keep at least one photo"
                : `Next: direct the tour with ${kept.length} photo${kept.length === 1 ? "" : "s"}`}
        </Button>
        <LinkButton href="/" variant="ghost">
          Start over
        </LinkButton>
      </div>
    </div>
  );
}
