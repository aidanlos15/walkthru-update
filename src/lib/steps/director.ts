import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { toImageBlock } from "@/lib/imageBlock";
import {
  MOTIONS,
  type DirectorOutput,
  type Motion,
  type Shot,
  type SourceImage,
} from "@/lib/types";

/**
 * Director step: Claude (claude-sonnet-5, vision) plans the walk-through.
 *
 * One shot per ROOM (not per photo): the images are grouped by their
 * user-confirmed labels, and Claude plans a single clip per room, grounded in
 * every photo of that room, picking the photo that makes the best start frame.
 * It returns shots by *image index* (not URL) so it never has to echo multi-MB
 * data URLs back; we map index → original URL locally. Output is constrained by
 * a JSON schema and re-validated on our side, with one retry if the model
 * somehow returns something unusable.
 */

const MODEL = "claude-sonnet-5";

const SYSTEM = `You are the director of a short, cinematic real-estate video tour.
You will be shown a set of property photos, each labelled "Image <n>". Every clip
is produced by an image-to-video model that animates ONE photo with a moving
camera and CANNOT see any of the other photos, so YOU must give it, in words, all
the spatial context and detail it needs. Work in two stages and return JSON only.

LABELS ARE GROUND TRUTH. Photos may carry a label, e.g. Image 3 (labelled
"Bedroom two"). Labels are the user's confirmed room assignments, made after
personally reviewing and correcting every photo, and they OVERRIDE anything you
infer from the pixels:
- Use a labelled photo's label VERBATIM as that shot's "room". Never rename,
  re-sort or merge labelled photos into a different room.
- Photos sharing a label are the same physical space; photos with different
  labels are different spaces, even if they look similar.
- Use the same label names when referring to rooms in "openPlanWith",
  "layout" and every "shotPrompt".

STAGE 1: Understand the whole property from ALL photos together.
- Decide which photos show the SAME physical space from different angles (match the
  furniture, floor, lighting, windows, art). Give one space one consistent room
  name — the user's label when present.
- Build a single floor-plan in your head: how the spaces connect, which areas are
  open-plan (flow together with no dividing wall), and where each thing, kitchen,
  dining table, sofa, TV, stairs, doors, windows, actually sits relative to the
  others. Many homes are one big open-plan living/dining/kitchen: treat it as one
  connected space and know exactly where each part is.
- Summarise the real layout in "layout" (2-4 sentences).

STAGE 2: Plan one shot PER ROOM.
- The message lists the user-confirmed rooms and which image indexes belong to
  each. Create EXACTLY ONE shot per room, no more and no fewer: N rooms in means
  N clips out. Never split a room into two shots and never skip a room.
- "startImageIndex": the room's photo that makes the strongest establishing
  start frame for the clip (the widest, clearest view of the space). It MUST be
  one of that room's own image indexes.
- Order the shots as a natural walk-through and keep open-plan-connected rooms
  adjacent, so the camera flows room to room.
- "room": the room's name from the list, verbatim.
  "openPlanWith": every adjoining open-plan room
  (both directions), or [] if fully enclosed. "caption": ≤6 words, evocative,
  sentence case, no end punctuation. "motion": the single best camera move.
- "shotPrompt": the most important field. Write a complete, self-contained prompt
  for the image-to-video model for THIS ROOM, grounded in EVERY photo of the
  room: the clip starts from the startImageIndex photo, and the other photos of
  the room tell you exactly what the camera reveals as it moves. Rules for it:
    * ACCURACY FIRST. Describe the furniture, materials, colours, textures and
      lighting EXACTLY as they appear in the room's photos. Preserve every piece
      already in frame: do not restyle, replace, remove or add furniture. The
      existing contents of the images are the ground truth; keep them faithful.
    * Then, only for what a moving camera would reveal beyond the frame, describe
      what is genuinely there based on THIS ROOM'S OTHER photos and your STAGE 1
      layout: to the left, to the right, and behind the camera. Take this context
      ONLY from what the photos actually show, NEVER from guesswork.
    * NO PHOTO = NO CONTEXT. If no other photo shows what lies in a direction,
      do NOT describe or reveal that direction at all. Instead explicitly
      instruct the video model to keep that side out of frame or as a neutral
      continuation of the visible walls and floor (e.g. "do not reveal the area
      behind the camera; if any off-frame surface enters view, continue the same
      plain wall and flooring already visible"). Never fill an unknown direction
      with plausible-sounding furniture or rooms.
    * Rooms with a single photo have NO off-frame context: their shotPrompt must
      describe only what is in frame and forbid revealing anything beyond it.
      Prefer conservative camera moves for these (Push In over 360 Orbit).
    * PREVENT HALLUCINATION. If the kitchen (or any room) is NOT in a given
      direction, say what really is there instead. Never invent a second kitchen,
      never relocate a room, never conjure a space the photos don't support.
    * Keep shotPrompts for the same space mutually consistent (same layout, same
      furniture positions from every angle).
- "title": a concise, editorial name for the whole tour.
Allowed motions: ${MOTIONS.join(", ")}.`;

/** JSON schema Claude must satisfy (structured outputs). */
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    layout: { type: "string" },
    shots: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          startImageIndex: { type: "integer" },
          room: { type: "string" },
          openPlanWith: { type: "array", items: { type: "string" } },
          motion: { type: "string", enum: [...MOTIONS] },
          caption: { type: "string" },
          shotPrompt: { type: "string" },
        },
        required: [
          "startImageIndex",
          "room",
          "openPlanWith",
          "motion",
          "caption",
          "shotPrompt",
        ],
      },
    },
  },
  required: ["title", "layout", "shots"],
} as const;

interface RawShot {
  startImageIndex: number;
  room: string;
  openPlanWith?: unknown;
  motion: string;
  caption: string;
  shotPrompt?: unknown;
}

/** One user-confirmed room and the indexes of its photos. */
interface RoomGroupIn {
  room: string;
  imageIndexes: number[];
}

/**
 * Group the images into rooms by their user-confirmed labels, preserving the
 * board order. Unlabeled images (shouldn't happen via the UI) each become their
 * own room so nothing is silently dropped.
 */
function groupByLabel(images: SourceImage[]): RoomGroupIn[] {
  const order: string[] = [];
  const byKey = new Map<string, RoomGroupIn>();
  images.forEach((img, i) => {
    const label = img.label?.trim();
    const key = label ? label.toLowerCase() : `__solo_${i}`;
    let group = byKey.get(key);
    if (!group) {
      group = { room: label || `Room ${byKey.size + 1}`, imageIndexes: [] };
      byKey.set(key, group);
      order.push(key);
    }
    group.imageIndexes.push(i);
  });
  return order.map((k) => byKey.get(k)!);
}

interface RawPlan {
  title: string;
  layout?: string;
  shots: RawShot[];
}

const MOTION_SET = new Set<string>(MOTIONS);

/** Normalize a raw openPlanWith value into a clean string[]. */
function toRoomList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean);
}
const trimCaption = (c: string) => c.trim().split(/\s+/).slice(0, 6).join(" ");

/** A safe default motion when the model omits/garbles one on a fallback shot. */
const DEFAULT_MOTION: Motion = "Push In";

/**
 * Validate + normalize the model output into DirectorOutput, or return null.
 *
 * Two guarantees enforced here regardless of what the model returns:
 *  - Exactly ONE shot per user-confirmed room (extras are dropped, the room
 *    name is ours verbatim, and the start frame must belong to the room).
 *  - Every room ends up as a shot: any room the model forgot is appended with
 *    a sensible default, so no room (e.g. the dining area) can silently vanish.
 */
function coerce(
  plan: RawPlan,
  images: SourceImage[],
  groups: RoomGroupIn[],
): DirectorOutput | null {
  if (!plan || typeof plan.title !== "string" || !Array.isArray(plan.shots)) {
    return null;
  }
  const groupByRoom = new Map(
    groups.map((g) => [g.room.trim().toLowerCase(), g]),
  );
  const toShot = (g: RoomGroupIn, s?: RawShot): Shot => {
    // Start frame: the model's pick when it belongs to this room, else the
    // room's first photo.
    const start = Number(s?.startImageIndex);
    const startIdx = g.imageIndexes.includes(start)
      ? start
      : g.imageIndexes[0];
    const shotPrompt =
      typeof s?.shotPrompt === "string" && s.shotPrompt.trim()
        ? s.shotPrompt.trim()
        : undefined;
    return {
      imageUrl: images[startIdx].url,
      imageUrls: [
        images[startIdx].url,
        ...g.imageIndexes
          .filter((i) => i !== startIdx)
          .map((i) => images[i].url),
      ],
      room: g.room,
      openPlanWith: toRoomList(s?.openPlanWith),
      shotPrompt,
      motion:
        s && MOTION_SET.has(s.motion) ? (s.motion as Motion) : DEFAULT_MOTION,
      caption: trimCaption(String(s?.caption ?? "")),
    };
  };

  const shots: Shot[] = [];
  const done = new Set<string>();
  for (const s of plan.shots) {
    const key = String(s?.room ?? "")
      .trim()
      .toLowerCase();
    const group = groupByRoom.get(key);
    if (!group || done.has(key)) continue; // unknown room or duplicate: drop
    done.add(key);
    shots.push(toShot(group, s));
  }

  // Completeness net: append any room the model skipped so every room is a clip.
  for (const g of groups) {
    const key = g.room.trim().toLowerCase();
    if (done.has(key)) continue;
    console.warn(
      `[director] room "${g.room}" was skipped: appending a fallback shot`,
    );
    shots.push(toShot(g));
  }

  if (shots.length === 0) return null;
  return { title: plan.title.trim() || "Property tour", shots };
}

async function callClaude(
  client: Anthropic,
  images: SourceImage[],
  groups: RoomGroupIn[],
  meta?: { title?: string },
): Promise<RawPlan> {
  const content: Anthropic.ContentBlockParam[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    content.push({
      type: "text",
      text: `Image ${i}${img.label ? ` (labelled "${img.label}")` : ""}:`,
    });
    content.push(await toImageBlock(img));
  }
  const roomList = groups
    .map((g) => `- "${g.room}": images ${g.imageIndexes.join(", ")}`)
    .join("\n");
  content.push({
    type: "text",
    text:
      `Here are ${images.length} photos of one property` +
      (meta?.title ? ` titled "${meta.title}".` : ".") +
      `\n\nThe user confirmed these ${groups.length} rooms:\n${roomList}\n\n` +
      `Plan exactly one shot per room (${groups.length} shots total) and ` +
      "return the tour plan as JSON matching the schema.",
  });

  const res = await client.messages.create({
    model: MODEL,
    // Each shot now carries a full, self-contained shotPrompt plus a global
    // layout, so give the model ample room for up to MAX_IMAGES detailed shots.
    max_tokens: 8000,
    thinking: { type: "disabled" },
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text) as RawPlan;
}

export async function director(
  images: SourceImage[],
  meta?: { title?: string },
): Promise<DirectorOutput> {
  if (images.length === 0) throw new Error("No images to direct.");
  const client = new Anthropic({ apiKey: env.anthropicKey() });
  const groups = groupByLabel(images);

  // Attempt, then retry once if the result is malformed/unusable.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      console.log(
        `[director] calling ${MODEL} (attempt ${attempt + 1}, ` +
          `${images.length} images → ${groups.length} rooms)…`,
      );
      const raw = await callClaude(client, images, groups, meta);
      const plan = coerce(raw, images, groups);
      if (plan) {
        if (typeof raw.layout === "string" && raw.layout.trim()) {
          console.log(`[director] layout: ${raw.layout.trim()}`);
        }
        console.log(
          `[director] ok: "${plan.title}", ${plan.shots.length} shots ` +
            `(${images.length} images in)`,
        );
        return plan;
      }
      console.warn(`[director] attempt ${attempt + 1} returned an invalid plan`);
    } catch (err) {
      console.warn(`[director] attempt ${attempt + 1} error:`, err);
      if (attempt === 1) {
        const msg = err instanceof Error ? err.message : "unknown error";
        throw new Error(`Director failed: ${msg}`);
      }
    }
  }
  throw new Error("Director returned an invalid plan after a retry.");
}
