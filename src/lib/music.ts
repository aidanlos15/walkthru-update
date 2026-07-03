/**
 * The soundtrack catalog: four hand-picked, royalty-free house tracks (Pixabay
 * Content License: free for commercial use, no attribution required), stored in
 * /public/music so they preview in the browser and mix locally with ffmpeg.
 *
 * The chosen track is laid under the final film by the slow-down step, which
 * replaces the Creatomate scratch audio. Client-safe: no env access here.
 */

export interface MusicTrack {
  id: string;
  name: string;
  artist: string;
  /** One-line vibe description shown on the picker. */
  vibe: string;
  /** Public path, served by Next from /public. */
  file: string;
}

export const MUSIC_TRACKS: MusicTrack[] = [
  {
    id: "deep-house",
    name: "Deep House",
    artist: "The Mountain",
    vibe: "Smooth, moody deep house — sleek and modern",
    file: "/music/deep-house.mp3",
  },
  {
    id: "upbeat-summer",
    name: "OOTD — Upbeat Summer House",
    artist: "FASSounds",
    vibe: "Bright, feel-good summer house — TikTok energy",
    file: "/music/upbeat-summer.mp3",
  },
  {
    id: "club-house",
    name: "House",
    artist: "AtlasAudio",
    vibe: "Punchy modern club house — confident and driving",
    file: "/music/club-house.mp3",
  },
  {
    id: "afro-house",
    name: "WE — Play House",
    artist: "PlayHouseSound",
    vibe: "Warm afro house groove — rhythmic and organic",
    file: "/music/afro-house.mp3",
  },
];

export const DEFAULT_MUSIC_ID = MUSIC_TRACKS[0].id;

export function musicTrack(id?: string): MusicTrack {
  return MUSIC_TRACKS.find((t) => t.id === id) ?? MUSIC_TRACKS[0];
}
