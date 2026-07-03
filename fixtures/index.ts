import type { DirectorOutput } from "@/lib/types";
import directorJson from "./director.json";

export { SAMPLE_IMAGES, SAMPLE_TITLE } from "./sample-images";

/** Canned director output for MOCK_MODE. */
export const MOCK_DIRECTOR: DirectorOutput =
  directorJson as unknown as DirectorOutput;

/**
 * A hosted sample tour video returned in MOCK_MODE instead of a real
 * Creatomate render. Reliable, CORS-friendly, and cinematic enough for a demo.
 * Swap for your own hosted clip anytime.
 */
export const MOCK_VIDEO_URL =
  "https://media.w3.org/2010/05/sintel/trailer.mp4";

/** Per-shot mock clip URL (same sample clip stands in for each shot). */
export const MOCK_CLIP_URL =
  "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4";
