"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Dropzone } from "@/components/Dropzone";
import { ThumbGrid, type LocalImage } from "@/components/ThumbGrid";
import { Button } from "@/components/ui/Button";
import { toJpegDataUrl } from "@/lib/browserImage";

// Mirrors MAX_IMAGES in src/lib/env.ts (client components can't read it).
const MAX = 100;

/**
 * Photo ingest: pick the photos, then hand off. The room sorting, renaming and
 * drag-to-fix review happens on the processing page's photo-review gate — the
 * exact same flow the Airbnb link path goes through after scraping.
 */
export default function UploadPage() {
  const router = useRouter();
  const [items, setItems] = useState<{ img: LocalImage; file: File }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const idRef = useRef(0);

  // Revoke object URLs on unmount to avoid leaks.
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

  async function generate() {
    if (items.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const images = await Promise.all(
        items.map(async (it) => ({ url: await toJpegDataUrl(it.file) })),
      );
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "photos", images }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start the tour.");
      router.push(`/process/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <PageShell
      eyebrow="Upload photos"
      heading="Add your room photos"
      sub="Drop in up to 100 images. Next, we'll sort them by room and you can fix anything we get wrong."
      back={{ href: "/", label: "Back" }}
    >
      <div className="space-y-6">
        <Dropzone onFiles={addFiles} disabled={submitting} />

        {items.length > 0 && (
          <div className="flex items-center justify-between text-sm text-muted">
            <span>
              {items.length} / {MAX} photos
            </span>
            <button
              onClick={() => {
                items.forEach((it) => URL.revokeObjectURL(it.img.url));
                setItems([]);
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
            disabled={items.length === 0 || submitting}
            onClick={generate}
          >
            {submitting ? "Starting…" : "Continue: sort by room"}
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
