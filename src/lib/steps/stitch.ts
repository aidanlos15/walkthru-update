import type { Shot } from "@/lib/types";
import { env, CREATOMATE_MUSIC_URL } from "@/lib/env";

/**
 * Stitch step: Creatomate concatenates the clips into one mp4: a title card,
 * each clip in order with a 0.5s crossfade, the caption overlaid on each clip,
 * and a background music track. Returns the final mp4 URL.
 *
 * Built as an inline RenderScript "source" (no template). Scenes share track 1
 * so they play back-to-back; a per-scene `transition` crossfades with the
 * previous scene. Music sits on track 2 spanning the whole timeline.
 */

const TITLE_DUR = 2.5;
const SCENE_DUR = 4.5;
const TRANS = 0.5;
const FONT = "Montserrat"; // safe, always-available Creatomate web font

interface CreatomateRender {
  id: string;
  status: string; // planned | waiting | rendering | succeeded | failed | ...
  url?: string;
}

function buildSource(shots: Shot[], title: string) {
  // Walkthrough mode (legs with an end frame): consecutive clips share their
  // boundary frame, so they concatenate as hard cuts with no trimming and no
  // transitions — a crossfade or trim would break the seamless walk. Captions
  // are dropped too: text popping up mid-walk breaks the first-person feel.
  const walkthrough = shots.some((s) => s.endImageUrl);

  // Timeline length: title (no transition) + each scene overlapping the prior
  // by the crossfade duration.
  const total = TITLE_DUR + shots.length * (SCENE_DUR - TRANS);

  const titleCard = {
    type: "composition",
    track: 1,
    duration: TITLE_DUR,
    fill_color: "#0c0d10",
    elements: [
      {
        type: "text",
        text: title,
        x_alignment: "50%",
        y_alignment: "50%",
        width: "80%",
        font_family: FONT,
        font_weight: "700",
        font_size: "8 vmin",
        fill_color: "#ffffff",
        text_transform: "none",
      },
    ],
  };

  if (walkthrough) {
    return {
      output_format: "mp4",
      width: 1920,
      height: 1080,
      frame_rate: 30,
      elements: [
        titleCard,
        // Each leg plays in full ("media" duration) and cuts directly into the
        // next; the boundary frames are identical, so the walk looks unbroken.
        ...shots.map((shot) => ({
          type: "video",
          track: 1,
          source: shot.clipUrl,
          fit: "cover",
          duration: "media",
          volume: "0%",
        })),
        {
          type: "audio",
          track: 2,
          time: 0,
          // Stretch to the full (unknown-length) timeline.
          duration: null,
          source: CREATOMATE_MUSIC_URL,
          loop: true,
          volume: "58%",
          audio_fade_out: "1.2 s",
        },
      ],
    };
  }

  const scenes = shots.map((shot) => ({
    type: "composition",
    track: 1,
    duration: SCENE_DUR,
    transition: { type: "fade", duration: TRANS },
    elements: [
      {
        type: "video",
        source: shot.clipUrl,
        fit: "cover",
        duration: SCENE_DUR,
        volume: "0%",
      },
      {
        type: "text",
        text: shot.caption,
        x_alignment: "50%",
        y_alignment: "50%",
        y: "88%",
        width: "88%",
        font_family: FONT,
        font_weight: "600",
        font_size: "4.6 vmin",
        fill_color: "#ffffff",
        background_color: "rgba(12,13,16,0.55)",
        background_x_padding: "4%",
        background_y_padding: "3%",
        background_border_radius: "20%",
      },
    ],
  }));

  const music = {
    type: "audio",
    track: 2,
    time: 0,
    duration: total,
    source: CREATOMATE_MUSIC_URL,
    loop: true,
    volume: "58%",
    audio_fade_out: "1.2 s",
  };

  return {
    output_format: "mp4",
    width: 1920,
    height: 1080,
    frame_rate: 30,
    elements: [titleCard, ...scenes, music],
  };
}

async function creatomate(path: string, init: RequestInit) {
  const res = await fetch(`https://api.creatomate.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.creatomateKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (body && (body.hint || body.error || body.message)) ||
      `HTTP ${res.status}`;
    throw new Error(`Creatomate error: ${msg}`);
  }
  return body;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (m: string) => console.log(`[stitch] ${m}`);

export async function stitchVideo(
  shots: Shot[],
  title: string,
): Promise<string> {
  const ready = shots.filter((s) => s.clipUrl);
  if (ready.length === 0) throw new Error("No rendered clips to stitch.");
  log(`creating Creatomate render: "${title}", ${ready.length} clips`);

  // Create the render. v1 returns an array of render objects.
  const created = (await creatomate("/v1/renders", {
    method: "POST",
    body: JSON.stringify({ source: buildSource(ready, title) }),
  })) as CreatomateRender[] | CreatomateRender;

  const render = Array.isArray(created) ? created[0] : created;
  if (!render?.id) throw new Error("Creatomate did not return a render id.");
  log(`render ${render.id} created (status ${render.status}), polling…`);

  // Poll until done.
  const start = Date.now();
  const deadline = start + 8 * 60 * 1000; // 8 min
  let status = render.status;
  let url = render.url;
  let last = "";
  while (status !== "succeeded" && status !== "failed") {
    if (Date.now() > deadline) throw new Error("Creatomate render timed out.");
    await sleep(4000);
    const polled = (await creatomate(`/v1/renders/${render.id}`, {
      method: "GET",
    })) as CreatomateRender;
    status = polled.status;
    url = polled.url;
    if (status !== last) {
      log(`status ${status} (${((Date.now() - start) / 1000).toFixed(0)}s)`);
      last = status;
    }
  }

  if (status !== "succeeded" || !url) {
    throw new Error(`Creatomate render ${status}.`);
  }
  log(`✓ final video ready: ${url}`);
  return url;
}
