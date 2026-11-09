/** Photo types the browser can resize. HEIC is converted by iPhone Safari on upload. */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Largest photo accepted before resizing (phone photos are usually 2–8 MB). */
export const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;

/** Longest edge after resizing. Claude scales larger images down to about this anyway. */
export const MAX_EDGE_PX = 1600;

/** Checks a picked file before upload. Returns an error message, or null when fine. */
export function validateReceiptFile(file: { type: string; size: number }): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "Choose a photo (JPEG, PNG or WebP).";
  }
  if (file.size > MAX_ORIGINAL_BYTES) {
    return "That photo is too large (over 20 MB).";
  }
  return null;
}

/** Size that fits within MAX_EDGE_PX on the longest side, never enlarging. */
export function fitWithin(width: number, height: number, maxEdge = MAX_EDGE_PX) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Storage path for a receipt photo: "<user id>/<uuid>.jpg".
 * The first folder must be the user's id, which the storage policy enforces.
 */
export function receiptImagePath(userId: string, id: string) {
  return `${userId}/${id}.jpg`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** True only for a path this app would create for this user. */
export function isOwnReceiptImagePath(path: string, userId: string): boolean {
  return new RegExp(`^${userId}/${UUID}\\.jpg$`).test(path);
}