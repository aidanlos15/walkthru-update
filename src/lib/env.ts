/**
 * Typed, fail-loud access to environment variables.
 * Secrets are only ever read here: never hardcoded elsewhere.
 */

export const MOCK_MODE = process.env.MOCK_MODE === "true";

export const RENDER_HERO_WITH_VEO = process.env.RENDER_HERO_WITH_VEO === "true";

/** Skip the Creatomate stitch and deliver the individual clips instead. */
export const SKIP_STITCH = process.env.SKIP_STITCH === "true";

/**
 * Playback speed of the final stitched film (post-processed with ffmpeg).
 * 0.7 = clips play at 0.7x so the tour lingers longer in each room; 1 skips
 * the step entirely. Clamped to [0.25, 1].
 */
export const FINAL_PLAYBACK_SPEED = Math.min(
  1,
  Math.max(0.25, parseFloat(process.env.FINAL_PLAYBACK_SPEED ?? "0.7") || 0.7),
);

/**
 * How many Higgsfield clips to render at once *per account* (each account's own
 * cap is 4). Default 1. Total simultaneous jobs = this × number of accounts.
 */
export const RENDER_CONCURRENCY = Math.min(
  4,
  Math.max(1, parseInt(process.env.RENDER_CONCURRENCY ?? "1", 10) || 1),
);

/**
 * Max images per tour (hard cap enforced at ingest, override via env).
 * Defaults to 100: the Claude API allows at most 100 images per request, and
 * the classify + director steps send every photo in a single request, so
 * anything above that would fail at the provider. Keep the client-side MAX in
 * the upload/test pages in sync with this.
 */
export const MAX_IMAGES = Math.min(
  100,
  Math.max(1, parseInt(process.env.MAX_IMAGES ?? "100", 10) || 100),
);

/**
 * Read a required secret. In MOCK_MODE we never call providers, so a missing
 * key is fine and returns "". In live mode a missing key throws loudly.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value && value.trim().length > 0) return value.trim();

  if (MOCK_MODE) return "";

  throw new Error(
    `Missing required environment variable "${name}". ` +
      `Set it in .env, or set MOCK_MODE=true to run without providers.`,
  );
}

/** Apify actor that scrapes direct Airbnb room URLs (override via env). */
export const APIFY_AIRBNB_ACTOR =
  process.env.APIFY_AIRBNB_ACTOR?.trim() ||
  "tri_angle~airbnb-rooms-urls-scraper";

/** Background music for the stitched video (a reachable mp3 URL). */
export const CREATOMATE_MUSIC_URL =
  process.env.CREATOMATE_MUSIC_URL?.trim() ||
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3";

/** One Higgsfield account's credentials. */
export interface HiggsfieldAccount {
  key: string;
  secret: string;
}

/**
 * The pool of Higgsfield accounts to shard render jobs across. Each account has
 * its own concurrency cap, so spreading shots over several accounts multiplies
 * throughput and avoids the per-account "concurrent request" 400s.
 *
 * Set `HIGGSFIELD_ACCOUNTS` to a comma-separated list of `key:secret` pairs.
 * Falls back to the single HIGGSFIELD_API_KEY / HIGGSFIELD_API_SECRET pair.
 */
export function higgsfieldAccounts(): HiggsfieldAccount[] {
  const raw = process.env.HIGGSFIELD_ACCOUNTS?.trim();
  if (raw) {
    const accounts = raw
      .split(",")
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const idx = pair.indexOf(":");
        if (idx === -1) {
          throw new Error(
            `Malformed HIGGSFIELD_ACCOUNTS entry "${pair}": expected "key:secret".`,
          );
        }
        return {
          key: pair.slice(0, idx).trim(),
          secret: pair.slice(idx + 1).trim(),
        };
      })
      .filter((a) => a.key && a.secret);
    if (accounts.length > 0) return accounts;
  }

  // No pool configured: fall back to the single-account credentials.
  if (MOCK_MODE) return [{ key: "", secret: "" }];
  return [
    {
      key: requireEnv("HIGGSFIELD_API_KEY"),
      secret: requireEnv("HIGGSFIELD_API_SECRET"),
    },
  ];
}

/** Convenience getters: call these inside step modules, not at import time. */
export const env = {
  anthropicKey: () => requireEnv("ANTHROPIC_API_KEY"),
  higgsfieldKey: () => requireEnv("HIGGSFIELD_API_KEY"),
  higgsfieldSecret: () => requireEnv("HIGGSFIELD_API_SECRET"),
  /** v2 client wants a single "KEY:SECRET" credentials string. */
  higgsfieldCredentials: () =>
    `${requireEnv("HIGGSFIELD_API_KEY")}:${requireEnv("HIGGSFIELD_API_SECRET")}`,
  apifyToken: () => requireEnv("APIFY_TOKEN"),
  creatomateKey: () => requireEnv("CREATOMATE_API_KEY"),
  falKey: () => requireEnv("FAL_KEY"),
};
