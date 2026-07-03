import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { toImageBlock } from "@/lib/imageBlock";
import type { RoomGroup, SourceImage } from "@/lib/types";

/**
 * Room-sort step: Claude (vision) groups a loose pile of property photos by the
 * physical space each one shows, and flags open-plan layouts.
 *
 * This is the same understanding the director relies on, exposed on its own for
 * the /test tool: drop images, see how they cluster into rooms and which spaces
 * flow into each other. Photos of one continuous space (even from different
 * angles) land in the same group; open-plan adjacencies are recorded on both
 * sides so downstream video generation never invents a wall that isn't there.
 */

const MODEL = "claude-sonnet-5";

const SYSTEM = `You are an expert estate photographer cataloguing a set of property photos.
You will be shown a set of photos, each labelled "Image <n>".

Group the photos by the physical space they show and return JSON only. Rules:
- Put every photo into exactly one group. Photos of the SAME physical space,   even shot from different angles, go in the same group. Photos of different
  spaces go in different groups.
- Give each group a specific, human room name (e.g. "Open-plan kitchen & living
  room", "Master bedroom", "Family bathroom", "Rear garden"). Be consistent.
- CRITICAL: detect open-plan layouts. When a space visually continues into
  another with no dividing wall, list every adjoining room in "openPlanWith" for
  that group. Cross-check angles: if one photo shows a second area beyond the
  first with no wall between them, they are open plan. Use [] for fully enclosed
  rooms. If two of your groups are actually one continuous open-plan space,
  reference each other in "openPlanWith".
- In "layoutNotes" describe the walls and openings in one short line, e.g.
  "Open to the kitchen on the right, solid wall on the left".
- List the 0-based image indexes that belong to each group in "imageIndexes".`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          room: { type: "string" },
          openPlanWith: { type: "array", items: { type: "string" } },
          layoutNotes: { type: "string" },
          imageIndexes: { type: "array", items: { type: "integer" } },
        },
        required: ["room", "openPlanWith", "layoutNotes", "imageIndexes"],
      },
    },
  },
  required: ["groups"],
} as const;

interface RawGroup {
  room?: unknown;
  openPlanWith?: unknown;
  layoutNotes?: unknown;
  imageIndexes?: unknown;
}
interface RawResult {
  groups?: RawGroup[];
}

const toRoomList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

/**
 * Validate + normalize the model output. Every image index is placed exactly
 * once: out-of-range/duplicate indexes are dropped, and any image the model
 * forgot is swept into an "Unsorted" group so nothing silently disappears.
 */
function coerce(raw: RawResult, count: number): RoomGroup[] {
  const seen = new Set<number>();
  const groups: RoomGroup[] = [];
  for (const g of raw.groups ?? []) {
    const idxs = Array.isArray(g.imageIndexes) ? g.imageIndexes : [];
    const imageIndexes = idxs
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 0 && n < count && !seen.has(n));
    imageIndexes.forEach((n) => seen.add(n));
    if (imageIndexes.length === 0) continue;
    groups.push({
      room: String(g.room || "Room").trim() || "Room",
      openPlanWith: toRoomList(g.openPlanWith),
      layoutNotes:
        typeof g.layoutNotes === "string" && g.layoutNotes.trim()
          ? g.layoutNotes.trim()
          : undefined,
      imageIndexes,
    });
  }
  const leftover: number[] = [];
  for (let i = 0; i < count; i++) if (!seen.has(i)) leftover.push(i);
  if (leftover.length > 0) {
    groups.push({ room: "Unsorted", openPlanWith: [], imageIndexes: leftover });
  }
  return groups;
}

async function callClaude(
  client: Anthropic,
  images: SourceImage[],
): Promise<RawResult> {
  const content: Anthropic.ContentBlockParam[] = [];
  for (let i = 0; i < images.length; i++) {
    content.push({ type: "text", text: `Image ${i}:` });
    content.push(await toImageBlock(images[i]));
  }
  content.push({
    type: "text",
    text: `Here are ${images.length} photos of one property. Group them by room as JSON matching the schema.`,
  });

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    thinking: { type: "disabled" },
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text) as RawResult;
}

export async function classifyRooms(
  images: SourceImage[],
): Promise<RoomGroup[]> {
  if (images.length === 0) throw new Error("No images to classify.");
  const client = new Anthropic({ apiKey: env.anthropicKey() });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      console.log(
        `[classify] calling ${MODEL} (attempt ${attempt + 1}, ${images.length} images)…`,
      );
      const groups = coerce(await callClaude(client, images), images.length);
      if (groups.length > 0) {
        console.log(`[classify] ok: ${groups.length} groups`);
        return groups;
      }
    } catch (err) {
      console.warn(`[classify] attempt ${attempt + 1} error:`, err);
      if (attempt === 1) {
        const msg = err instanceof Error ? err.message : "unknown error";
        throw new Error(`Classify failed: ${msg}`);
      }
    }
  }
  throw new Error("Classifier returned nothing usable after a retry.");
}
