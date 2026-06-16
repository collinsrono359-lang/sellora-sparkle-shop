// Client-side image compression. Returns a smaller File ready for upload.
// Downscales to maxDim (longest side) and re-encodes as JPEG at given quality.
export async function compressImage(
  file: File,
  opts: { maxDim?: number; quality?: number; mime?: string } = {}
): Promise<File> {
  const { maxDim = 1600, quality = 0.82, mime = "image/jpeg" } = opts;
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob(res, mime, quality)
    );
    if (!blob || blob.size >= file.size) return file;
    const ext = mime === "image/webp" ? "webp" : "jpg";
    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.${ext}`, { type: mime, lastModified: Date.now() });
  } catch {
    return file;
  }
}
