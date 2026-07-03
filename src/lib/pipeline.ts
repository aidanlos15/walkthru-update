import { MOCK_MODE, SKIP_STITCH } from "./env";
import { getJob, updateJob } from "./jobStore";
import { MOCK_DIRECTOR, MOCK_VIDEO_URL, MOCK_CLIP_URL } from "../../fixtures";
import { scrapeAirbnb } from "./steps/scrape";
import { director } from "./steps/director";
import { renderClips, promptFor } from "./steps/render";
import { stitchVideo } from "./steps/stitch";
import { slowDownVideo } from "./steps/slowdown";
import { musicTrack } from "./music";
import { groupShotsByRoom } from "./groupShots";
import type { Shot } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (m: string) => console.log(`[pipeline] ${m}`);

/** Shared failure handler: record the error on the job so the UI can show it. */
function fail(jobId: string, err: unknown, elapsed: () => string): void {
  const message = err instanceof Error ? err.message : "Something went wrong.";
  console.error(`[pipeline] ❌ job ${jobId} failed [${elapsed()}]:`, err);
  updateJob(jobId, { status: "error", error: message });
}

/**
 * Phase one of the orchestrator: ingest. Fire-and-forget from the create-job
 * route; it mutates job state in the store as it advances, and the client polls
 * the status endpoint.
 *
 * Both modes stop at `awaiting_photos`: the photos (scraped or uploaded) are
 * shown to the user on the room board, and nothing is directed until they
 * review them and continue (which calls `directPipeline`).
 */
export async function runPipeline(jobId: string): Promise<void> {
  const t0 = Date.now();
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;
  try {
    const job = getJob(jobId);
    if (!job) return;
    log(
      `▶ job ${jobId} start: mode=${job.mode}, mock=${MOCK_MODE}` +
        (job.mode === "photos" ? `, ${job.images.length} photos` : ""),
    );

    // ---- Ingest -----------------------------------------------------------
    if (job.mode === "link") {
      updateJob(jobId, { status: "scraping" });
      log(`scraping ${job.airbnbUrl}`);
      let images = job.images;
      let scrapedTitle: string | undefined;
      if (MOCK_MODE) {
        await sleep(1600);
        const { SAMPLE_IMAGES, SAMPLE_TITLE } = await import(
          "../../fixtures/sample-images"
        );
        images = SAMPLE_IMAGES;
        scrapedTitle = SAMPLE_TITLE;
      } else {
        const res = await scrapeAirbnb(job.airbnbUrl!);
        images = res.images;
        scrapedTitle = res.title;
      }
      log(`scraped ${images.length} images (title: ${scrapedTitle ?? "-"})`);

      // ---- Review gate ----------------------------------------------------
      updateJob(jobId, {
        images,
        title: scrapedTitle,
        status: "awaiting_photos",
      });
      log(`awaiting photo review: ${images.length} photos [${elapsed()}]`);
      return;
    }

    // ---- Review gate ------------------------------------------------------
    // Photo mode: same flow as link mode, minus the scrape. Pause immediately
    // so the user sorts the uploaded photos into rooms on the process page.
    updateJob(jobId, { status: "awaiting_photos" });
    log(
      `awaiting photo review: ${job.images.length} uploaded photos [${elapsed()}]`,
    );
  } catch (err) {
    fail(jobId, err, elapsed);
  }
}

/**
 * Phase 1b: plan the tour. Called from the photos route once the user has
 * reviewed the room board (both modes) and continued.
 */
export async function directPipeline(jobId: string): Promise<void> {
  const t0 = Date.now();
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;
  try {
    const job = getJob(jobId);
    if (!job) return;
    if (job.status !== "awaiting_photos") {
      log(`direct ignored: job ${jobId} is ${job.status}, not awaiting_photos`);
      return;
    }
    await directPhase(jobId, elapsed);
  } catch (err) {
    fail(jobId, err, elapsed);
  }
}

/**
 * The director step itself: plans every shot and writes the render prompts,
 * then stops at `awaiting_confirmation` for the prompt-review gate (which
 * resumes via `resumePipeline`).
 */
async function directPhase(
  jobId: string,
  elapsed: () => string,
): Promise<void> {
  const job = getJob(jobId);
  if (!job) return;
  try {
    const images = job.images;
    // In link mode the scraped listing title was stashed on the job as a hint.
    const scrapedTitle = job.title;

    updateJob(jobId, { status: "directing" });
    log(`directing (${images.length} images) with Claude…`);
    let title: string;
    let shots: Shot[];
    if (MOCK_MODE) {
      await sleep(1600);
      title = MOCK_DIRECTOR.title;
      shots = MOCK_DIRECTOR.shots.map((s) => ({ ...s }));
    } else {
      const plan = await director(images, { title: scrapedTitle });
      title = plan.title;
      shots = plan.shots;
    }
    // Compile related rooms together: same-space and open-plan-connected shots
    // become one contiguous block at their first photo's spot, so a stray photo
    // (e.g. a sitting-room/dining shot uploaded last) no longer trails the tour.
    shots = groupShotsByRoom(shots);

    // Compute the exact Higgsfield prompt for every shot now, so the review
    // screen shows precisely what will be sent once the user confirms.
    shots = shots.map((s) => ({ ...s, renderPrompt: promptFor(s) }));

    // ---- Review gate ------------------------------------------------------
    updateJob(jobId, { title, shots, status: "awaiting_confirmation" });
    log(`director done: "${title}", ${shots.length} shots [${elapsed()}]`);
    shots.forEach((s, i) =>
      log(`  ${i + 1}. ${s.room} · ${s.motion} · "${s.caption}"`),
    );
    log(`awaiting confirmation before rendering [${elapsed()}]`);
  } catch (err) {
    fail(jobId, err, elapsed);
  }
}

/**
 * Phase two: render every planned shot on Higgsfield. Called from the confirm
 * route once the user has read the prompts and approved them. Reads the planned
 * shots straight from the store, so no state has to be threaded through the
 * pause. Stops at `awaiting_stitch`: the clips are done and shown to the user,
 * and nothing is stitched until they confirm (which calls `stitchPipeline`).
 */
export async function resumePipeline(jobId: string): Promise<void> {
  const t0 = Date.now();
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;
  try {
    const job = getJob(jobId);
    if (!job) return;
    if (job.status !== "awaiting_confirmation") {
      log(`resume ignored: job ${jobId} is ${job.status}, not awaiting`);
      return;
    }
    let shots = job.shots ?? [];

    // ---- Render clips -----------------------------------------------------
    updateJob(jobId, { status: "rendering" });
    log(`rendering ${shots.length} clips via Higgsfield…`);
    if (MOCK_MODE) {
      await sleep(2200);
      shots = shots.map((s) => ({
        ...s,
        clipUrl: MOCK_CLIP_URL,
        renderPrompt: s.renderPrompt ?? promptFor(s),
      }));
    } else {
      shots = await renderClips(shots, (progress) =>
        updateJob(jobId, { renderProgress: progress }),
      );
    }
    updateJob(jobId, { shots });
    log(`all clips rendered [${elapsed()}]`);

    // With SKIP_STITCH we deliver the individual clips and stop here; the
    // result screen shows each clip. Flip the flag off to re-enable stitching.
    if (SKIP_STITCH) {
      updateJob(jobId, { status: "done" });
      log(
        `stitch skipped (SKIP_STITCH): delivering ${shots.length} clips [${elapsed()}]`,
      );
      return;
    }

    // ---- Review gate ------------------------------------------------------
    updateJob(jobId, { status: "awaiting_stitch" });
    log(`awaiting stitch confirmation: ${shots.length} clips ready [${elapsed()}]`);
  } catch (err) {
    fail(jobId, err, elapsed);
  }
}

/**
 * Phase three: stitch the rendered clips into the final film. Called from the
 * stitch route once the user has previewed the clips and clicked next.
 */
export async function stitchPipeline(jobId: string): Promise<void> {
  const t0 = Date.now();
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;
  try {
    const job = getJob(jobId);
    if (!job) return;
    if (job.status !== "awaiting_stitch") {
      log(`stitch ignored: job ${jobId} is ${job.status}, not awaiting_stitch`);
      return;
    }
    const shots = job.shots ?? [];
    const title = job.title ?? "Property tour";

    updateJob(jobId, { status: "stitching" });
    log(`stitching final video via Creatomate…`);
    let videoUrl: string;
    if (MOCK_MODE) {
      await sleep(1800);
      videoUrl = MOCK_VIDEO_URL;
    } else {
      videoUrl = await stitchVideo(shots, title);
      // Re-time the film locally (ffmpeg) so the tour lingers in each room,
      // and lay the user's chosen soundtrack under it at normal tempo.
      videoUrl = await slowDownVideo(
        jobId,
        videoUrl,
        musicTrack(job.musicId).file,
      );
    }

    updateJob(jobId, { status: "done", videoUrl });
    log(`✅ done [${elapsed()}]: ${videoUrl}`);
  } catch (err) {
    fail(jobId, err, elapsed);
  }
}
