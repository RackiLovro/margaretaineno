/**
 * Shared helpers for talking to the home storage server over a
 * Cloudflare Tunnel. The Vercel app acts as a thin proxy so the
 * gallery page can use same-origin /api/* routes.
 *
 * Auth model: middleware (src/middleware.ts) gates every route with a
 * signed `margareta_gate` cookie. API routes therefore don't need their
 * own gate check — by the time a request reaches them, the middleware
 * has already verified the cookie (or redirected to /enter). The
 * legacy `?k=` query is still accepted as a fallback so direct API
 * calls (e.g. curl) keep working without a cookie.
 */

const STORAGE_BASE = process.env.STORAGE_BASE_URL;
const STORAGE_SECRET = process.env.STORAGE_SECRET;
const GATE = process.env.GALLERY_PASSWORD ?? "";
const COOKIE_NAME = "margareta_gate";

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

export const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Probe whether the home storage server is reachable (500ms timeout).
 */
export async function isStorageUp(): Promise<boolean> {
  if (!STORAGE_BASE) return false;
  try {
    const r = await fetch(`${STORAGE_BASE.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(500),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Legacy/fallback gate. Middleware is the primary gate via cookie.
 * This still accepts `?k=<GALLERY_PASSWORD>` for non-browser clients
 * (curl, scripts) and checks the signed cookie as a defence in depth.
 */
export function checkGate(req: Request): boolean {
  if (!GATE) return true;
  // Cookie set by middleware?
  const cookie = req.headers.get("cookie") ?? "";
  if (cookie.includes(`${COOKIE_NAME}=${sign(GATE)}`)) return true;
  // Legacy query-string key.
  const url = new URL(req.url);
  return url.searchParams.get("k") === GATE;
}

function sign(value: string): string {
  const secret = process.env.GATE_SECRET ?? "margareta";
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  const s = value + "|" + secret;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}