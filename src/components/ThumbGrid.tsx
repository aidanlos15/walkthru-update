"use client";

import Image from "next/image";
import { CloseIcon } from "./icons";

export interface LocalImage {
  id: string;
  url: string; // object URL or data URL for preview
}

interface ThumbGridProps {
  images: LocalImage[];
  onRemove: (id: string) => void;
}

export function ThumbGrid({ images, onRemove }: ThumbGridProps) {
  if (images.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {images.map((img, i) => (
        <div
          key={img.id}
          className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-tint shadow-soft"
        >
          <Image
            src={img.url}
            alt={`Room photo ${i + 1}`}
            fill
            unoptimized
            className="object-cover"
          />
          <button
            type="button"
            onClick={() => onRemove(img.id)}
            aria-label="Remove photo"
            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-ink/70 text-white opacity-0 backdrop-blur transition-opacity hover:bg-ink group-hover:opacity-100"
          >
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
  );
}
