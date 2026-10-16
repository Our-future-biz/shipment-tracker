"use client";

// Photos taken with the phone camera for the survey and exceptions. They are scaled down so the
// longest side is at most 2048 px (JPEG, quality 0.85) before upload or queueing: evidence stays
// readable, a photo is ~0.5–1.5 MB instead of 4–12 MB, so it uploads quickly over the yard's Wi-Fi
// and more fit in the phone's storage while offline. A photo the browser cannot read (e.g. some
// HEIC files) is kept as taken.

export const PHOTO_MAX_SIDE = 2048;
export const PHOTO_QUALITY = 0.85;
/** The server's upload limit (gate files). */
export const PHOTO_MAX_BYTES = 25 * 1024 * 1024;

/** Size to scale a width × height picture to, so the longest side is at most `max`. */
export function fitWithin(width: number, height: number, max = PHOTO_MAX_SIDE): { width: number; height: number } {
  const side = Math.max(width, height);
  if (side <= max || side === 0) return { width, height };
  const k = max / side;
  return { width: Math.round(width * k), height: Math.round(height * k) };
}

export async function downscalePhoto(file: File): Promise<{ blob: Blob; fileName: string; fileType: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", PHOTO_QUALITY));
    if (!blob || blob.size >= file.size) throw new Error("not smaller");
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return { blob, fileName: `${base}.jpg`, fileType: "image/jpeg" };
  } catch {
    return { blob: file, fileName: file.name || "photo.jpg", fileType: file.type || "image/jpeg" };
  }
}
