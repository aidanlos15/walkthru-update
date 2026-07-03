"use client";

import { useState } from "react";
import Image from "next/image";
import { CloseIcon } from "./icons";
import type { LocalImage } from "./ThumbGrid";

/** One room section on the upload board (client-side grouping state). */
export interface RoomGroupUI {
  id: string;
  room: string;
  imageIds: string[];
  /**
   * User-added rooms stick around while empty (so they can be named and filled
   * by dragging); auto-sorted rooms disappear when their last photo leaves.
   */
  pinned?: boolean;
}

interface RoomBoardProps {
  groups: RoomGroupUI[];
  images: LocalImage[];
  /** Images still being auto-sorted (shown in a pending section). */
  pendingIds: string[];
  onRemove: (imageId: string) => void;
  /** Move an image into a group, or into a brand-new room with "new". */
  onMove: (imageId: string, toGroupId: string | "new") => void;
  onRename: (groupId: string, room: string) => void;
  /** Add a new, empty room for the user to name and drag photos into. */
  onAddRoom: () => void;
  /** Remove an (empty) user-added room. */
  onRemoveGroup: (groupId: string) => void;
}

/**
 * Room-grouped photo board: thumbnails sorted into named room sections, each
 * removable (X) and draggable into another room — or onto the "new room"
 * target — when the auto-sort gets it wrong. Room names are editable and are
 * sent to the director as labels, so corrections here improve the tour.
 */
export function RoomBoard({
  groups,
  images,
  pendingIds,
  onRemove,
  onMove,
  onRename,
  onAddRoom,
  onRemoveGroup,
}: RoomBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const byId = new Map(images.map((img) => [img.id, img]));
  const pending = pendingIds
    .map((id) => byId.get(id))
    .filter((img): img is LocalImage => Boolean(img));

  if (groups.length === 0 && pending.length === 0) return null;

  function dropHandlers(targetId: string | "new") {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        setOverId(targetId);
      },
      onDragLeave: () => setOverId((cur) => (cur === targetId ? null : cur)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        if (id) onMove(id, targetId);
        setOverId(null);
        setDraggingId(null);
      },
    };
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section
          key={g.id}
          {...dropHandlers(g.id)}
          className={`rounded-2xl border p-4 transition-colors ${
            overId === g.id
              ? "border-accent bg-tint"
              : "border-line bg-surface"
          }`}
        >
          <div className="mb-3 flex items-baseline gap-3">
            <input
              value={g.room}
              onChange={(e) => onRename(g.id, e.target.value)}
              aria-label="Room name"
              className="min-w-0 flex-1 bg-transparent text-lg font-semibold text-ink outline-none placeholder:text-muted focus:underline focus:decoration-accent/50 focus:underline-offset-4"
              placeholder="Room name"
            />
            <span className="shrink-0 text-xs text-muted">
              {g.imageIds.length} photo{g.imageIds.length === 1 ? "" : "s"}
            </span>
            {g.imageIds.length === 0 && (
              <button
                type="button"
                onClick={() => onRemoveGroup(g.id)}
                className="shrink-0 text-xs font-medium text-muted transition-colors hover:text-accent"
              >
                Remove room
              </button>
            )}
          </div>

          {g.imageIds.length === 0 && (
            <p className="grid place-items-center rounded-xl border border-dashed border-line px-4 py-6 text-sm text-muted">
              Drag photos into this room
            </p>
          )}

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {g.imageIds.map((id) => {
              const img = byId.get(id);
              if (!img) return null;
              return (
                <div
                  key={id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", id);
                    e.dataTransfer.effectAllowed = "move";
                    setDraggingId(id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setOverId(null);
                  }}
                  className={`group relative aspect-square cursor-grab overflow-hidden rounded-xl bg-tint shadow-soft active:cursor-grabbing ${
                    draggingId === id ? "opacity-40" : ""
                  }`}
                >
                  <Image
                    src={img.url}
                    alt={g.room}
                    fill
                    unoptimized
                    className="pointer-events-none object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => onRemove(id)}
                    aria-label="Remove photo"
                    className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-lg bg-ink/70 text-white opacity-0 backdrop-blur transition-opacity hover:bg-ink focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <CloseIcon />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Drop target for splitting a photo out into its own room. */}
      {draggingId ? (
        <div
          {...dropHandlers("new")}
          className={`grid place-items-center rounded-2xl border border-dashed p-6 text-sm transition-colors ${
            overId === "new"
              ? "border-accent bg-tint text-accent"
              : "border-line text-muted"
          }`}
        >
          Drop here to start a new room
        </div>
      ) : (
        groups.length > 0 && (
          <button
            type="button"
            onClick={onAddRoom}
            className="grid w-full place-items-center rounded-2xl border border-dashed border-line p-4 text-sm font-medium text-muted transition-colors hover:border-accent/60 hover:bg-tint/40 hover:text-accent"
          >
            + Add a room
          </button>
        )
      )}

      {pending.length > 0 && (
        <section className="rounded-2xl border border-dashed border-line p-4">
          <div className="mb-3 flex items-center gap-2 text-sm text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            Sorting {pending.length} photo{pending.length === 1 ? "" : "s"} by
            room…
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {pending.map((img) => (
              <div
                key={img.id}
                className="relative aspect-square animate-pulse overflow-hidden rounded-xl bg-tint shadow-soft"
              >
                <Image
                  src={img.url}
                  alt="Photo being sorted"
                  fill
                  unoptimized
                  className="object-cover opacity-70"
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
