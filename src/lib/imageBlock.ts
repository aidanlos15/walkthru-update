import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import type { SourceImage } from "@/lib/types";

/**
 * Turn a source image (data URL or https URL) into an Anthropic image block.
 * Hosted URLs are passed by reference so we never echo multi-MB data URLs into
 * a request more than once.
 *
 * Data URLs (manual uploads) are stored at high resolution so Higgsfield gets
 * a sharp start frame — but Claude neither needs nor accepts that much: vision
 * tops out around 1568px on the long edge, and a many-photo upload at full
 * size would blow the API's request cap. So the API copy is downscaled here,
 * server-side, leaving the stored original untouched for the render step.
 */

/** Anthropic's recommended max long edge for vision inputs. */
const API_MAX_EDGE = 1568;

export async function toImageBlock(
  image: SourceImage,
): Promise<Anthropic.ImageBlockParam> {
  const dataUrl = /^data:(.+?);base64,(.*)$/s.exec(image.url);
  if (!dataUrl) {
    return { type: "image", source: { type: "url", url: image.url } };
  }

  let mediaType = dataUrl[1];
  let buffer: Buffer = Buffer.from(dataUrl[2].replace(/\s/g, ""), "base64");
  try {
    const meta = await sharp(buffer).metadata();
    const edge = Math.max(meta.width ?? 0, meta.height ?? 0);
    if (edge > API_MAX_EDGE) {
      buffer = await sharp(buffer)
        .resize({ width: API_MAX_EDGE, height: API_MAX_EDGE, fit: "inside" })
        .jpeg({ quality: 82 })
        .toBuffer();
      mediaType = "image/jpeg";
    }
  } catch {
    // Unreadable by sharp: send as-is and let the API decide.
  }

  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mediaType as Anthropic.Base64ImageSource["media_type"],
      data: buffer.toString("base64"),
    },
  };
}
