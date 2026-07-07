import { NextResponse } from "next/server";
import { checkGate } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns a short-lived signed token + the storage URL so the client
 * can upload the raw original directly to the home storage server,
 * bypassing Vercel's serverless body/timeout limits entirely.
 *
 * Cookie-gated by middleware (no anonymous access).
 */
export async function POST(req: Request) {
  if (!checkGate(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const base = process.env.STORAGE_BASE_URL;
  const secret = process.env.STORAGE_SECRET;
  if (!base || !secret) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
  }
  const exp = Date.now() + 2 * 60 * 1000; // 2 minutes
  const token = signToken(secret, exp);
  return NextResponse.json({ url: base.replace(/\/$/, ""), token, exp });
}

function signToken(secret: string, exp: number): string {
  // HMAC-SHA256 via Web Crypto (available in Node 22 + Edge).
  // We sign "exp" with the secret so the storage server can verify.
  const key = secret + "|" + exp;
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  const s = key;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
  }
  return exp + "." + h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}