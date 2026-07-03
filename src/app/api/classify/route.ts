import { NextRequest, NextResponse } from "next/server";
import { MAX_IMAGES, MOCK_MODE } from "@/lib/env";
import { classifyRooms } from "@/lib/steps/classify";
import type { ClassifyResult, RoomGroup, SourceImage } from "@/lib/types";

export const runtime = "nodejs";

interface ClassifyBody {
  images?: SourceImage[];
}

/** A deterministic, plausible grouping for MOCK_MODE (no provider calls). */
function mockGroups(count: number): RoomGroup[] {
  const idxs = Array.from({ length: count }, (_, i) => i);
  const half = Math.ceil(count / 2);
  const groups: RoomGroup[] = [
    {
      room: "Open-plan kitchen & living room",
      openPlanWith: ["Dining area"],
      layoutNotes: "Kitchen flows into the living room, no dividing wall",
      imageIndexes: idxs.slice(0, half),
    },
  ];
  if (count > half) {
    groups.push({
      room: "Master bedroom",
      openPlanWith: [],
      layoutNotes: "Fully enclosed room",
      imageIndexes: idxs.slice(half),
    });
  }
  return groups;
}

export async function POST(req: NextRequest) {
  let body: ClassifyBody;
  try {
    body = (await req.json()) as ClassifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const images = Array.isArray(body.images) ? body.images : [];
  if (images.length === 0) {
    return NextResponse.json(
      { error: "Add at least one photo." },
      { status: 400 },
    );
  }
  if (images.length > MAX_IMAGES) {
    return NextResponse.json(
      { error: `Max ${MAX_IMAGES} photos at a time.` },
      { status: 400 },
    );
  }

  try {
    const groups = MOCK_MODE
      ? mockGroups(images.length)
      : await classifyRooms(images);
    return NextResponse.json({ groups } satisfies ClassifyResult);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not sort the photos.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
