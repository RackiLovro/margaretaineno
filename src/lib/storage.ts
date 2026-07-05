/**
 * Shared helpers for talking to the home storage server over a
 * Cloudflare Tunnel. The Vercel app acts as a thin proxy so the
 * gallery page can use same-origin /api/* routes.
 */

const STORAGE_BASE = process.env.STORAGE_BASE_URL;
const STORAGE_SECRET = process.env.STORAGE_SECRET;

export function storageConfigured() {
  return Boolean(STORAGE_BASE && STORAGE_SECRET);
}

export function storageUrl(path: string) {
  if (!STORAGE_BASE) throw new Error("STORAGE_BASE_URL is not set");
  return `${STORAGE_BASE.replace(/\/$/, "")}${path}`;
}

export function authHeaders(extra?: HeadersInit) {
  return {
    "x-gallery-secret": STORAGE_SECRET ?? "",
    ...extra,
  };
}

/** Allowed MIME types for uploads. */
export const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

export const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per photo (no Drive limit now)

/** Optional gallery password gate (set via GALLERY_PASSWORD). */
export function checkGate(req: Request): boolean {
  const pw = process.env.GALLERY_PASSWORD;
  if (!pw) return true;
  const url = new URL(req.url);
  const provided = url.searchParams.get("k") ?? "";
  return provided === pw;
}