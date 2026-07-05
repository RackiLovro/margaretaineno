import { NextResponse } from "next/server";

const GATE = process.env.GALLERY_PASSWORD ?? "";
const COOKIE_NAME = "margareta_gate";
const MAX_AGE = 60 * 60 * 24 * 7;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { password, next } = await req.json().catch(() => ({}));
  if (!GATE || password !== GATE) {
    return NextResponse.json({ error: "Kriva lozinka" }, { status: 401 });
  }
  const url = new URL(req.url);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, sign(GATE), {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    maxAge: MAX_AGE,
    path: "/",
  });
  return res;
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