import { NextResponse } from "next/server";

const GATE = process.env.GALLERY_PASSWORD ?? "";
const COOKIE_NAME = "margareta_gate";
// 7 days — long enough for the wedding weekend, short enough to expire.
const MAX_AGE = 60 * 60 * 24 * 7;

export function middleware(req: Request) {
  const url = new URL(req.url);
  const { pathname, search } = url;

  // Allow the auth endpoints and the enter page through.
  if (pathname === "/enter" || pathname === "/api/auth") {
    return NextResponse.next();
  }

  // Already logged in?
  const cookies = parseCookies(req.headers.get("cookie") ?? "");
  if (cookies[COOKIE_NAME] === sign(GATE)) {
    return NextResponse.next();
  }

  // QR link: ?k=ljubav — exchange for cookie, strip the param.
  if (GATE && url.searchParams.get("k") === GATE) {
    const res = NextResponse.redirect(new URL(pathname, url), 307);
    res.cookies.set(COOKIE_NAME, sign(GATE), {
      httpOnly: true,
      sameSite: "lax",
      secure: url.protocol === "https:",
      maxAge: MAX_AGE,
      path: "/",
    });
    return res;
  }

  // No cookie, no key → send to the lock screen.
  const enter = new URL("/enter", url);
  if (search) enter.searchParams.set("next", pathname + search);
  return NextResponse.redirect(enter, 307);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const i = pair.indexOf("=");
    if (i > -1) {
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  }
  return out;
}

// Simple deterministic HMAC-free sign: hash the password with the
// GATE_SECRET so the cookie is bound to the env, not forgeable client-side.
function sign(value: string): string {
  const secret = process.env.GATE_SECRET ?? "margareta";
  // FNV-1a 64-bit — fast, dependency-free, plenty for a gate cookie.
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