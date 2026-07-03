import type { SourceImage } from "@/lib/types";

/**
 * Fake "scraped" images used in MOCK_MODE for the link flow (and as a stand-in
 * gallery). Real, hot-linkable Unsplash property photos so thumbnails render.
 */
export const SAMPLE_TITLE = "Sunlit canyon retreat";

export const SAMPLE_IMAGES: SourceImage[] = [
  {
    url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&q=80",
    label: "Exterior",
  },
  {
    url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80",
    label: "Living room",
  },
  {
    url: "https://images.unsplash.com/photo-1556911220-bff31c812dba?w=1200&q=80",
    label: "Kitchen",
  },
  {
    url: "https://images.unsplash.com/photo-1600121848594-d8644e57abab?w=1200&q=80",
    label: "Bedroom",
  },
  {
    url: "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1200&q=80",
    label: "Bathroom",
  },
  {
    url: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1200&q=80",
    label: "View",
  },
];
