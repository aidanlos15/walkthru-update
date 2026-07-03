/**
 * Browser-only image helpers. Imported by upload/test client pages.
 *
 * Convert any uploaded image to a JPEG data URL via a canvas, so everything
 * downstream receives a compact, well-supported format regardless of the
 * source (JPEG, not PNG: a phone photo re-encoded as lossless PNG is 3-6 MB
 * and a many-photo upload then exceeds provider request limits).
 *
 * Sized for the RENDER, not for Claude: this copy is the start frame
 * Higgsfield animates, so it keeps 2048px / q0.9 — comparable to the original
 * listing URLs the Airbnb path passes straight through. The Claude API calls
 * (classify/director) downscale their own copy server-side in imageBlock.ts,
 * so uploads and scrapes produce the same video fidelity.
 */
export async function toJpegDataUrl(
  file: File,
  maxEdge = 2048,
  quality = 0.9,
): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      `Couldn't read "${file.name}". Try a JPG, PNG, or WebP image.`,
    );
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't process images here.");
  // JPEG has no alpha channel: transparent source pixels would come out black,
  // so lay them over white instead.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", quality);
}
