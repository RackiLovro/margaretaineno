import { NextResponse } from "next/server";
import {
  storageConfigured,
  storageUrl,
  authHeaders,
  checkGate,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Hobby caps serverless duration at ~10s. We keep uploads serial
// and aggressively compressed on the client so each fits well under that.

export async function POST(req: Request) {
  if (!checkGate(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!storageConfigured()) {
    return NextResponse.json(
      { error: "Storage not configured (set STORAGE_BASE_URL + STORAGE_SECRET)" },
      { status: 500 }
    );
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  // Forward the raw body to the home server — avoids re-parsing here.
  const body = await req.arrayBuffer();
  try {
    const r = await fetch(storageUrl("/upload"), {
      method: "POST",
      headers: authHeaders({ "content-type": contentType }),
      body,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return NextResponse.json(data, { status: r.status });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("Storage upload proxy error:", err);
    return NextResponse.json({ error: "Storage server unreachable" }, { status: 502 });
  }
}