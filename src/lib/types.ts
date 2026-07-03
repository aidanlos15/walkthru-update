/** Shared domain types used across ingest, director, render, stitch. */

export const MOTIONS = [
  "360 Orbit",
  "Arc Left",
  "Arc Right",
  "Push In",
  "Zoom Out",
] as const;
export type Motion = (typeof MOTIONS)[number];

/** One image entering the pipeline (uploaded or scraped). */
export interface SourceImage {
  /** Publicly reachable URL, or a data URL for uploaded photos. */
  url: string;
  /** Optional room label from the scraper, if any. */
  label?: string;
}

/**
 * A single planned shot from the director. In walkthrough mode (2+ rooms) a
 * shot is one LEG of a continuous walk: the camera travels from `imageUrl`
 * (start frame) to `endImageUrl` (end frame). Consecutive legs share their
 * boundary photo, so the concatenated film has no visible cuts. A single-room
 * tour falls back to one classic camera-move clip (no endImageUrl).
 */
export interface Shot {
  /** The start frame Higgsfield animates from. */
  imageUrl: string;
  /** Walkthrough leg: the end frame the camera must arrive at. */
  endImageUrl?: string;
  /**
   * Every photo of this room (primary first). Higgsfield accepts at most two
   * (start + end frame, motion permitting); the rest ground the shotPrompt.
   */
  imageUrls?: string[];
  room: string;
  motion: Motion;
  caption: string; // max ~6 words
  /**
   * Other rooms this space visually flows into with no dividing wall
   * (open-plan). Kept on the shot so the render prompt can tell Higgsfield not
   * to invent, or omit, a wall that contradicts an adjoining clip.
   */
  openPlanWith?: string[];
  /**
   * The full, self-contained generation prompt the director writes for this
   * shot, grounded in the whole-property spatial model and, above all, in the
   * furniture and finishes actually visible in this photo. Describes what is in
   * frame and precisely what lies to each side / behind the camera, so a camera
   * move reveals the true adjacent areas in their real positions rather than an
   * invented or misplaced room. The render step wraps this with the camera
   * motion and the fixed guardrails.
   */
  shotPrompt?: string;
  /** Filled in during the render step. */
  clipUrl?: string;
  /** The exact generation prompt sent to Higgsfield for this shot. */
  renderPrompt?: string;
}

/** Director (Claude) output contract: validated on the way in. */
export interface DirectorOutput {
  title: string;
  shots: Shot[];
}

export type JobStatus =
  | "queued"
  | "scraping"
  // The listing photos are scraped; we pause so the user can see them and drop
  // any they don't want before the director plans the tour.
  | "awaiting_photos"
  | "directing"
  // The director has planned every shot and written the render prompts, but we
  // pause here so the user can read them over before we send anything off.
  | "awaiting_confirmation"
  | "rendering"
  // Every clip is rendered; we pause so the user can preview them before the
  // final stitch.
  | "awaiting_stitch"
  | "stitching"
  | "done"
  | "error";

/** UI-facing pipeline steps, in order. */
export const STEP_ORDER: JobStatus[] = [
  "scraping",
  "directing",
  "rendering",
  "stitching",
];

export type IngestMode = "photos" | "link";

/** Per-shot stage while a clip is being generated on Higgsfield. */
export type RenderStage =
  | "uploading"
  | "queued"
  | "in_progress"
  | "completed";

/** Live progress of the render step, updated as each shot advances. */
export interface RenderProgress {
  /** Total shots to render. */
  total: number;
  /** Shots fully rendered so far. */
  completed: number;
  /** The shot currently in flight, if any (1-based index). */
  current?: { index: number; room: string; stage: RenderStage };
}

/** The full state of one tour job, held in memory. */
export interface Job {
  id: string;
  mode: IngestMode;
  status: JobStatus;
  createdAt: number;
  /** Inputs. */
  images: SourceImage[];
  airbnbUrl?: string;
  /** Outputs, filled as steps complete. */
  title?: string;
  shots?: Shot[];
  /** Soundtrack chosen at the clip-review gate (id into MUSIC_TRACKS). */
  musicId?: string;
  videoUrl?: string;
  error?: string;
  /** Live render progress, updated per shot during the render step. */
  renderProgress?: RenderProgress;
}

/** A finished per-shot clip, surfaced to the UI when stitching is skipped. */
export interface ClipPublic {
  url: string;
  room: string;
  motion: Motion;
  caption: string;
  /** Rooms this space opens into (open-plan), if any. */
  openPlanWith?: string[];
  /** The exact prompt the director handed to Higgsfield for this clip. */
  prompt?: string;
}

/**
 * A planned shot surfaced to the review screen: the exact prompt we will hand to
 * Higgsfield, plus enough context to label it, shown before rendering begins.
 */
export interface PlannedShot {
  room: string;
  motion: Motion;
  caption: string;
  openPlanWith?: string[];
  prompt: string;
}

/** One grouped physical space from the room-sort test tool. */
export interface RoomGroup {
  /** Specific room / area name, e.g. "Open-plan kitchen & living room". */
  room: string;
  /** Other rooms this space flows into with no dividing wall. */
  openPlanWith: string[];
  /** One-line note on walls/openings. */
  layoutNotes?: string;
  /** Indexes into the submitted image array that belong to this space. */
  imageIndexes: number[];
}

/** Response from the /api/classify room-sort endpoint. */
export interface ClassifyResult {
  groups: RoomGroup[];
}

/** Trimmed job shape sent to the client on status polls. */
export interface JobPublic {
  id: string;
  mode: IngestMode;
  status: JobStatus;
  title?: string;
  videoUrl?: string;
  error?: string;
  /** Count of shots, so the UI can show "rendering 3/8" flavor if desired. */
  shotCount?: number;
  /** Live render progress, surfaced so the UI can show per-shot status. */
  renderProgress?: RenderProgress;
  /** Individual rendered clips (present when stitching is skipped/pending). */
  clips?: ClipPublic[];
  /**
   * The planned shots and their render prompts, surfaced while the job is
   * `awaiting_confirmation` so the user can review them before we send them off.
   */
  plannedShots?: PlannedShot[];
  /**
   * The scraped listing photos, surfaced while the job is `awaiting_photos` so
   * the user can review them (and drop any) before directing begins.
   */
  photos?: SourceImage[];
}
