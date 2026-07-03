"use client";

import { useState } from "react";
import { Button } from "./ui/Button";
import { DownloadIcon, ShareIcon, CheckIcon } from "./icons";

interface VideoPlayerProps {
  src: string;
  title?: string;
}

export function VideoPlayer({ src, title }: VideoPlayerProps) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: ignore */
    }
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl bg-ink shadow-lift">
        <video
          key={src}
          src={src}
          controls
          autoPlay
          playsInline
          className="aspect-video w-full bg-ink"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => {
            const a = document.createElement("a");
            a.href = src;
            a.download = `${(title ?? "walkthru-tour").replace(/\s+/g, "-").toLowerCase()}.mp4`;
            a.target = "_blank";
            a.rel = "noopener";
            a.click();
          }}
        >
          <DownloadIcon />
          Download
        </Button>
        <Button variant="ghost" onClick={copyLink}>
          {copied ? <CheckIcon /> : <ShareIcon />}
          {copied ? "Link copied" : "Share"}
        </Button>
      </div>
    </div>
  );
}
