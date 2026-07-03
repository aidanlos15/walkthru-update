"use client";

import { useRef, useState } from "react";
import { UploadIcon } from "./icons";

interface DropzoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

/** Drag-and-drop + click-to-browse multi-image input (UI only). */
export function Dropzone({ onFiles, disabled }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(list: FileList | null) {
    if (!list) return;
    const images = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (images.length) onFiles(images);
  }

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border border-dashed p-12 text-center transition-colors ${
        dragging
          ? "border-accent bg-tint"
          : "border-line bg-surface hover:border-accent/60 hover:bg-tint/40"
      } ${disabled ? "pointer-events-none opacity-60" : ""}`}
    >
      <span className="grid h-14 w-14 place-items-center rounded-xl bg-tint text-accent">
        <UploadIcon />
      </span>
      <div className="space-y-1">
        <p className="text-[15px] font-medium text-ink">
          Drag your room photos here
        </p>
        <p className="text-sm text-muted">
          or click to browse · up to 100 images · JPG or PNG
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
