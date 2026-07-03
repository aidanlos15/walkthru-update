import { HiggsfieldClient } from "@higgsfield/client";
import type { Motion, RenderProgress, RenderStage, Shot } from "@/lib/types";
import {
  RENDER_CONCURRENCY,
  higgsfieldAccounts,
  type HiggsfieldAccount,
} from "@/lib/env";

/**
 * Render step: Higgsfield DoP (dop-turbo) animates each shot into a ~5s clip.
 *
 * Uses the v1 `generate()` API: it wraps the payload as `{ params }` (which the
 * DoP endpoint requires) and polls the job-set at /v1/job-sets/{id} until each
 * job completes, exposing the clip at `jobs[0].results.raw.url`.
 *
 * Shots run in parallel. Uploaded photos arrive as base64 data URLs that
 * Higgsfield's servers can't fetch, so we decode + `uploadImage()` them to the
 * Higgsfield CDN first; scraped Airbnb URLs are public and pass straight
 * through. Returns the shots with `clipUrl` set, in the original order.
 */

const HF_BASE = "https://platform.higgsfield.ai";
const POLL_INTERVAL_MS = 5000;
const RENDER_MAX_POLL_MS = 12 * 60 * 1000; // tolerate queue backlog
const POLL_CONFIG = {
  maxRetries: 2,
  timeout: 60 * 1000, // POST timeout (creation is fast; we poll ourselves)
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (msg: string) => console.log(`[render] ${msg}`);

// Higgsfield caps concurrent jobs per account (currently 4). Because jobs from
// aborted/earlier runs keep occupying slots until they finish, a fresh submit
// can be rejected with a 400 even when we submit strictly one at a time. Treat
// that as transient: wait for a slot to free up and retry.
const SUBMIT_MAX_RETRIES = 8;
const SUBMIT_BACKOFF_MS = 15000;

function isConcurrencyLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /concurrent request/i.test(msg);
}

/** A cinematic phrase per motion, folded into the generation prompt. */
const MOTION_PHRASE: Record<Motion, string> = {
  "360 Orbit": "Smooth 360 degree orbit around the space",
  "Arc Left": "Camera arcs gently to the left across the room",
  "Arc Right": "Camera arcs gently to the right across the room",
  "Push In": "Slow cinematic push in",
  "Zoom Out": "Slow cinematic zoom out revealing the whole space",
};

/**
 * Candidate Higgsfield motion names per motion, in priority order (lowercased).
 * Matched exact-first, then substring: so "Push In" → "Dolly In", not a zoom.
 * (Verified against the live 121-motion catalog: 360 Orbit / Arc Left /
 * Arc Right / Zoom Out exist verbatim; Push In resolves to Dolly In.)
 */
const MOTION_MATCH: Record<Motion, string[]> = {
  "360 Orbit": ["360 orbit", "orbit"],
  "Arc Left": ["arc left"],
  "Arc Right": ["arc right"],
  "Push In": ["dolly in", "super dolly in"],
  "Zoom Out": ["zoom out", "dolly out"],
};

/**
 * Fallback scene description when the director didn't author a shotPrompt
 * (e.g. a completeness-net shot, or MOCK_MODE fixtures). Faithful and minimal:
 * preserve what's in the photo, and only note open-plan flow.
 */
function fallbackScene(shot: Shot): string {
  const openPlan = shot.openPlanWith?.length
    ? ` This area is open plan and flows directly into the ${shot.openPlanWith.join(
        " and ",
      )} with no dividing wall between them: do not add, remove or imply any wall separating these spaces.`
    : "";
  return `${shot.room}. Keep every piece of furniture and every finish exactly as shown in the photo.${openPlan} ${shot.caption}.`;
}

/**
 * Build the exact generation prompt handed to Higgsfield for a shot.
 *
 * The heart of the prompt is the director's own `shotPrompt`: written after
 * looking at ALL the photos, so it states what is really in frame and what lies
 * in each direction (accurate furniture and layout, no invented rooms). We wrap
 * it with the camera motion and a fixed set of guardrails:
 *  - Fidelity: preserve the photo's real furniture/finishes; don't restyle.
 *  - Consistency: anything revealed off-frame must match the described space.
 *  - No people: the property is empty; humans kept appearing, so forbid them.
 */
export function promptFor(shot: Shot): string {
  const scene = shot.shotPrompt?.trim() || fallbackScene(shot);
  return (
    `${MOTION_PHRASE[shot.motion]}. ${scene} ` +
    "Photorealistic real-estate walkthrough, smooth stable camera, natural lighting. " +
    "Stay faithful to the photo: keep the exact furniture, layout, materials, colours " +
    "and finishes that are already in frame: do not restyle, replace, remove or add " +
    "furniture. Anything the camera reveals beyond the frame must match the space exactly " +
    "as described above, in its real position: never invent, duplicate or relocate a room, " +
    "and never introduce a jarring or out-of-place colour, material or feature. " +
    "Only reveal what the description above explicitly places off-frame. If a direction " +
    "or area is not described, do not show it: keep it out of frame, or continue the " +
    "already-visible walls and flooring as a plain, neutral surface. Never fill an " +
    "undescribed angle with imagined furniture, doorways, windows or rooms. " +
    "The property is empty and unoccupied: absolutely no people, no humans, " +
    "no figures, no silhouettes or reflections of people anywhere in the frame."
  );
}

/** Decode a data URL to a Buffer + Higgsfield image format, else null. */
function decodeDataUrl(
  url: string,
): { buffer: Buffer; format: "jpeg" | "png" | "webp" } | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(url);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const format = mime.includes("png")
    ? "png"
    : mime.includes("webp")
      ? "webp"
      : "jpeg";
  return { buffer: Buffer.from(m[2].replace(/\s/g, ""), "base64"), format };
}

/**
 * Poll a job-set to completion ourselves (instead of the SDK's opaque
 * withPolling) so we can log each status transition and control the timeout.
 */
async function pollJobSet(
  id: string,
  label: string,
  auth: string,
  onStatus?: (status: string) => void,
): Promise<string> {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < RENDER_MAX_POLL_MS) {
    const secs = ((Date.now() - start) / 1000).toFixed(0);
    let res: Response;
    try {
      res = await fetch(`${HF_BASE}/v1/job-sets/${id}`, {
        headers: { Authorization: auth },
      });
    } catch (e) {
      log(`${label}: poll network error (${secs}s), retrying: ${String(e)}`);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    if (res.status >= 500) {
      log(`${label}: poll HTTP ${res.status} (${secs}s), retrying`);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    if (!res.ok) {
      throw new Error(`${label}: poll failed HTTP ${res.status}`);
    }
    const data = (await res.json().catch(() => ({}))) as {
      jobs?: { status?: string; results?: { raw?: { url?: string } } }[];
    };
    const job = data.jobs?.[0];
    const status = job?.status ?? "unknown";
    if (status !== last) {
      log(`${label}: ${status} (${secs}s)`);
      onStatus?.(status);
      last = status;
    }
    if (status === "completed") {
      const url = job?.results?.raw?.url;
      if (!url) throw new Error(`${label}: completed but no clip url`);
      return url;
    }
    if (status === "failed" || status === "nsfw" || status === "canceled") {
      throw new Error(`${label}: Higgsfield job ${status}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `${label}: timed out after ${(RENDER_MAX_POLL_MS / 60000).toFixed(0)} min`,
  );
}

/** Retry a submit on Higgsfield's account-wide concurrency 400 (slots occupied
 * by in-flight jobs from other/earlier runs) rather than failing the pipeline. */
async function withConcurrencyRetry<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (isConcurrencyLimit(e) && attempt < SUBMIT_MAX_RETRIES) {
        const waitMs = SUBMIT_BACKOFF_MS * (attempt + 1);
        log(
          `${label}: concurrency cap reached, waiting ${(waitMs / 1000).toFixed(0)}s ` +
            `for a slot (retry ${attempt + 1}/${SUBMIT_MAX_RETRIES})`,
        );
        await sleep(waitMs);
        continue;
      }
      throw e;
    }
  }
}

export async function renderClips(
  shots: Shot[],
  onProgress?: (progress: RenderProgress) => void,
): Promise<Shot[]> {
  if (shots.length === 0) return shots;

  // One client per Higgsfield account. Each account has its own concurrency cap,
  // so sharding shots across the pool multiplies throughput and sidesteps the
  // per-account "concurrent request" 400s.
  const accounts = higgsfieldAccounts();
  const clients = accounts.map((account, i) => ({
    account,
    accountNo: i + 1,
    client: new HiggsfieldClient({
      apiKey: account.key,
      apiSecret: account.secret,
      ...POLL_CONFIG,
    }),
  }));
  const totalAtOnce = accounts.length * RENDER_CONCURRENCY;
  log(
    `starting ${shots.length} shots across ${accounts.length} account` +
      `${accounts.length === 1 ? "" : "s"} ` +
      `(${RENDER_CONCURRENCY}/account → up to ${totalAtOnce} at once)`,
  );

  // Track completed shots and the shot currently in flight so the UI can show
  // live per-shot progress instead of a static spinner for minutes.
  let completed = 0;
  const report = (index: number, room: string, stage: RenderStage) => {
    onProgress?.({
      total: shots.length,
      completed,
      current: { index: index + 1, room, stage },
    });
  };
  onProgress?.({ total: shots.length, completed: 0 });

  // Best-effort motion presets: matched by name, skipped if unavailable. The
  // motion catalog is global, so any account's client can fetch it. We also
  // remember whether the preset supports a start+end frame pair, so multi-photo
  // rooms can hand Higgsfield a second angle of the same space as the end frame.
  const motionByShot = new Map<Motion, { id: string; startEnd: boolean }>();
  try {
    const catalog = await clients[0].client.getMotions();
    const named = catalog.map((c) => ({
      ...c,
      lc: c.name?.toLowerCase() ?? "",
    }));
    for (const motion of Object.keys(MOTION_MATCH) as Motion[]) {
      for (const term of MOTION_MATCH[motion]) {
        const hit =
          named.find((c) => c.lc === term) ??
          named.find((c) => c.lc.includes(term));
        if (hit) {
          motionByShot.set(motion, {
            id: hit.id,
            startEnd: hit.start_end_frame === true,
          });
          break;
        }
      }
    }
  } catch {
    // No catalog: fall back to prompt-only motion. Not fatal.
  }

  async function renderOne(
    shot: Shot,
    index: number,
    entry: { account: HiggsfieldAccount; accountNo: number; client: HiggsfieldClient },
  ): Promise<Shot> {
    const { account, accountNo, client } = entry;
    const label = `shot ${index + 1}/${shots.length} [${shot.room} · ${shot.motion} · acct ${accountNo}]`;
    const auth = `Key ${account.key}:${account.secret}`;

    // Resolve public image URLs Higgsfield can fetch. Upload with the same
    // account that will render, so the clip and its source live together.
    const resolve = async (url: string): Promise<string> => {
      const decoded = decodeDataUrl(url);
      if (!decoded) return url;
      log(`${label}: uploading photo to Higgsfield CDN…`);
      report(index, shot.room, "uploading");
      return client.uploadImage(decoded.buffer, decoded.format);
    };
    const imageUrl = await resolve(shot.imageUrl);

    const preset = motionByShot.get(shot.motion);
    // Multi-photo room + a motion that supports a start/end frame pair: hand
    // Higgsfield a second angle of the same room as the end frame, so the
    // camera travels between two real views of the space.
    let endImageUrl: string | undefined;
    const secondPhoto = shot.imageUrls?.find((u) => u !== shot.imageUrl);
    if (secondPhoto && preset?.startEnd) {
      endImageUrl = await resolve(secondPhoto);
    }

    // Prefer the prompt the user reviewed (and possibly edited) at the gate; it
    // was computed via promptFor() during directing, so this is identical unless
    // it was hand-edited, in which case the edit is authoritative.
    const prompt = shot.renderPrompt?.trim() || promptFor(shot);
    log(
      `${label}: submitting (motion ${preset ? "preset" : "prompt-only"}` +
        `${endImageUrl ? ", start+end frame" : ""})…`,
    );
    // withPolling:false - create the job, then poll ourselves with logging.
    const submit = (withEndFrame: boolean) => () =>
      client.generate(
        "/v1/image2video/dop",
        {
          model: "dop-turbo",
          prompt,
          input_images: [
            { type: "image_url", image_url: imageUrl },
            ...(withEndFrame && endImageUrl
              ? [{ type: "image_url", image_url: endImageUrl }]
              : []),
          ],
          ...(preset ? { motions: [{ id: preset.id, strength: 0.8 }] } : {}),
        },
        { withPolling: false },
      );

    let jobSet: Awaited<ReturnType<ReturnType<typeof submit>>>;
    try {
      jobSet = await withConcurrencyRetry(label, submit(Boolean(endImageUrl)));
    } catch (e) {
      // If the two-image submit is rejected, fall back to start frame only
      // rather than failing the whole shot.
      if (!endImageUrl) throw e;
      log(`${label}: start+end frame rejected, retrying start-only: ${String(e)}`);
      jobSet = await withConcurrencyRetry(label, submit(false));
    }
    log(`${label}: job-set ${jobSet.id} created`);
    report(index, shot.room, "queued");

    const clipUrl = await pollJobSet(jobSet.id, label, auth, (status) => {
      // Map Higgsfield's status vocabulary onto our render stages.
      const stage: RenderStage =
        status === "in_progress" || status === "processing"
          ? "in_progress"
          : "queued";
      report(index, shot.room, stage);
    });
    completed++;
    onProgress?.({ total: shots.length, completed });
    log(`${label}: ✓ clip ready`);
    return { ...shot, clipUrl, renderPrompt: prompt };
  }

  // Shard the shots across accounts: every account runs up to RENDER_CONCURRENCY
  // workers, all pulling from one shared queue. Whichever account has a free
  // worker grabs the next shot, so a slow clip on one account never stalls the
  // others (least-loaded balancing). Output order matches input order.
  const results = new Array<Shot>(shots.length);
  let cursor = 0;
  const worker = async (entry: (typeof clients)[number]) => {
    while (true) {
      const i = cursor++;
      if (i >= shots.length) return;
      results[i] = await renderOne(shots[i], i, entry);
    }
  };

  const workers: Promise<void>[] = [];
  for (const entry of clients) {
    for (let k = 0; k < RENDER_CONCURRENCY; k++) {
      workers.push(worker(entry));
    }
  }
  await Promise.all(workers);
  return results;
}
