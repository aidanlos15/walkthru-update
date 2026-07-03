import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CREATOMATE_MUSIC_URL, FINAL_PLAYBACK_SPEED } from "@/lib/env";

/**
 * Slow-down step: after Creatomate stitches the film, re-time it locally with
 * ffmpeg so every clip plays at FINAL_PLAYBACK_SPEED (default 0.7x) and the
 * tour lingers longer in each room.
 *
 * Creatomate's render JSON has no playback-rate property (their own docs point
 * to ffmpeg for speed changes), so this runs on the stitched mp4 instead: the
 * video stream is re-timed with setpts, and — rather than slowing the baked-in
 * soundtrack into a drag — the music is re-laid at normal tempo from the same
 * source track Creatomate used, with the same volume and fade-out.
 *
 * The result is written to public/tours/<jobId>.mp4 and served by Next itself,
 * so no cloud storage is needed. Any failure (ffmpeg missing, download error)
 * logs and falls back to the original Creatomate URL rather than failing the
 * job at the last step.
 */

const log = (m: string) => console.log(`[slowdown] ${m}`);

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(out.trim())
        : reject(new Error(`${cmd} exited ${code}: ${err.slice(-400)}`)),
    );
  });
}

async function download(url: string, to: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  await writeFile(to, Buffer.from(await res.arrayBuffer()));
}

/**
 * Slow the stitched video to `FINAL_PLAYBACK_SPEED` and lay the chosen
 * soundtrack under it (at normal tempo). Returns a local URL for the result,
 * or the original URL when there is nothing to do or anything goes wrong.
 *
 * `musicFile` is a public path from the soundtrack catalog (e.g.
 * "/music/deep-house.mp3"); when set, the step runs even at speed 1 so the
 * chosen track still replaces the Creatomate scratch audio.
 */
export async function slowDownVideo(
  jobId: string,
  videoUrl: string,
  musicFile?: string,
): Promise<string> {
  const speed = FINAL_PLAYBACK_SPEED;
  if (speed >= 1 && !musicFile) return videoUrl;

  try {
    const dir = path.join(process.cwd(), "public", "tours");
    await mkdir(dir, { recursive: true });
    const src = path.join(dir, `${jobId}.orig.mp4`);
    const out = path.join(dir, `${jobId}.mp4`);

    log(`downloading stitched video for ${jobId}…`);
    await download(videoUrl, src);

    // Soundtrack: the chosen local track, else the default remote one.
    let music: string;
    if (musicFile) {
      music = path.join(process.cwd(), "public", musicFile);
    } else {
      music = path.join(dir, `${jobId}.music.mp3`);
      await download(CREATOMATE_MUSIC_URL, music);
    }

    const orig = parseFloat(
      await run("ffprobe", [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "csv=p=0",
        src,
      ]),
    );
    if (!Number.isFinite(orig) || orig <= 0) {
      throw new Error(`could not read duration (got "${orig}")`);
    }
    const slowed = orig / speed;
    const fadeStart = Math.max(0, slowed - 1.5);
    log(
      `re-timing to ${speed}x: ${orig.toFixed(1)}s → ${slowed.toFixed(1)}s…`,
    );

    await run("ffmpeg", [
      "-y", "-v", "error",
      "-i", src,
      "-stream_loop", "-1",
      "-i", music,
      "-filter_complex",
      `[0:v]setpts=PTS/${speed}[v];` +
        `[1:a]volume=0.58,afade=t=out:st=${fadeStart.toFixed(3)}:d=1.5[a]`,
      "-map", "[v]",
      "-map", "[a]",
      "-t", slowed.toFixed(3),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-movflags", "+faststart",
      out,
    ]);

    log(`✓ slowed video ready: /tours/${jobId}.mp4`);
    return `/tours/${jobId}.mp4`;
  } catch (err) {
    // Never fail the job on the final flourish: deliver the normal-speed cut.
    console.warn(
      `[slowdown] failed, delivering the original video:`,
      err instanceof Error ? err.message : err,
    );
    return videoUrl;
  }
}
