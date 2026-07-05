import { NextResponse } from "next/server";
import { storageConfigured, storageUrl, authHeaders, checkGate } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!checkGate(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!storageConfigured()) {
    return NextResponse.json(
      { error: "Storage not configured (set STORAGE_BASE_URL + STORAGE_SECRET)" },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const pageToken = url.searchParams.get("pageToken") ?? undefined;
  const pageSize = url.searchParams.get("pageSize") ?? undefined;

  const qs = new URLSearchParams();
  if (pageToken) qs.set("pageToken", pageToken);
  if (pageSize) qs.set("pageSize", pageSize);

  try {
    const r = await fetch(storageUrl(`/photos?${qs.toString()}`), {
      headers: authHeaders(),
      cache: "no-store",
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return NextResponse.json(data, { status: r.status });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("Storage list proxy error:", err);
    return NextResponse.json({ error: "Storage server unreachable" }, { status: 502 });
  }
}