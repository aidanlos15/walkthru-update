import type { SourceImage } from "@/lib/types";
import { MAX_IMAGES, APIFY_AIRBNB_ACTOR, env } from "@/lib/env";

export interface ScrapeResult {
  title?: string;
  images: SourceImage[];
}

/**
 * Ingest B: scrape an Airbnb listing via the Apify actor (link mode only).
 *
 * Uses run-sync-get-dataset-items so we get the scraped items back in one call
 * (fine on localhost, no serverless timeout). Actor output shapes vary between
 * Airbnb actors, so image/title extraction is intentionally defensive.
 */

/** Pull a URL string out of a scraped image entry (string or object). */
function imageUrlOf(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const o = entry as Record<string, unknown>;
    for (const k of ["url", "imageUrl", "image", "picture", "src", "large"]) {
      if (typeof o[k] === "string") return o[k] as string;
    }
  }
  return undefined;
}

/** Pull a caption/room label out of a scraped image entry, if any. */
function labelOf(entry: unknown): string | undefined {
  if (entry && typeof entry === "object") {
    const o = entry as Record<string, unknown>;
    for (const k of ["caption", "accessibilityLabel", "label", "title"]) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return undefined;
}

/** Find the first array of images among the likely field names. */
function extractImages(item: Record<string, unknown>): SourceImage[] {
  const candidates = [
    item.images,
    item.photos,
    item.pictures,
    item.imageUrls,
    item.photoUrls,
  ];
  for (const arr of candidates) {
    if (Array.isArray(arr) && arr.length) {
      const imgs: SourceImage[] = [];
      for (const entry of arr) {
        const url = imageUrlOf(entry);
        if (url && /^https?:\/\//i.test(url)) {
          imgs.push({ url, label: labelOf(entry) });
        }
      }
      if (imgs.length) return imgs.slice(0, MAX_IMAGES);
    }
  }
  return [];
}

const log = (m: string) => console.log(`[scrape] ${m}`);

export async function scrapeAirbnb(url: string): Promise<ScrapeResult> {
  const endpoint =
    `https://api.apify.com/v2/acts/${APIFY_AIRBNB_ACTOR}` +
    `/run-sync-get-dataset-items?token=${encodeURIComponent(env.apifyToken())}`;

  log(`running Apify actor ${APIFY_AIRBNB_ACTOR} for ${url}…`);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      startUrls: [{ url }],
      locale: "en-US",
      currency: "USD",
      maxItems: 1,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Airbnb scrape failed (Apify HTTP ${res.status}). ${detail.slice(0, 160)}`,
    );
  }

  const items = (await res.json().catch(() => null)) as
    | Record<string, unknown>[]
    | null;
  const item = Array.isArray(items) ? items[0] : null;
  if (!item) {
    throw new Error("Couldn't read that listing: no data returned.");
  }

  const images = extractImages(item);
  if (images.length === 0) {
    throw new Error(
      "Couldn't find any photos on that listing. Try a different Airbnb link.",
    );
  }

  const title =
    (typeof item.title === "string" && item.title) ||
    (typeof item.name === "string" && item.name) ||
    undefined;

  log(`got ${images.length} images (title: ${title ?? "-"})`);
  return { title: title || undefined, images };
}
