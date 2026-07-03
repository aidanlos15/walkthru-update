"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/Button";
import { LinkIcon } from "@/components/icons";

const AIRBNB_RE = /^https?:\/\/(www\.)?airbnb\.[a-z.]+\/rooms\/\d+/i;

export default function LinkPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const looksValid = AIRBNB_RE.test(url.trim());
  const showInlineError = touched && url.length > 0 && !looksValid;

  async function generate() {
    if (!looksValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "link", airbnbUrl: url.trim() }),
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
      eyebrow="Paste a link"
      heading="Paste an Airbnb listing"
      sub="We'll pull the photos and details, then direct the tour automatically."
      back={{ href: "/", label: "Back" }}
    >
      <div className="space-y-5">
        <div>
          <label
            htmlFor="airbnb-url"
            className="mb-2 block text-sm font-medium text-ink"
          >
            Listing URL
          </label>
          <div
            className={`flex items-center gap-3 rounded-xl bg-surface px-4 shadow-soft transition-shadow focus-within:shadow-ring ${
              showInlineError ? "shadow-ring" : ""
            }`}
          >
            <LinkIcon className="h-5 w-5 shrink-0 text-muted" />
            <input
              id="airbnb-url"
              type="url"
              inputMode="url"
              placeholder="https://www.airbnb.com/rooms/12345678"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={() => setTouched(true)}
              onKeyDown={(e) => e.key === "Enter" && generate()}
              className="h-12 w-full bg-transparent text-[15px] text-ink placeholder:text-muted/70 focus:outline-none"
            />
          </div>
          {showInlineError && (
            <p className="mt-2 text-sm text-accent600">
              That doesn't look like an Airbnb listing URL (e.g.
              airbnb.com/rooms/…).
            </p>
          )}
        </div>

        {error && (
          <p className="rounded-xl bg-tint px-4 py-3 text-sm text-accent600 shadow-soft">
            {error}
          </p>
        )}

        <div className="flex justify-end pt-1">
          <Button size="lg" disabled={!looksValid || submitting} onClick={generate}>
            {submitting ? "Starting…" : "Generate tour"}
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
