import { NextResponse } from "next/server";
import { storageConfigured, storageUrl, authHeaders, checkGate, isStorageUp } from "@/lib/storage";
import { listR2Photos, r2Configured } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!checkGate(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Try workstation first.
  if (storageConfigured() && (await isStorageUp())) {
    try {
      const r = await fetch(storageUrl("/photos"), {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (r.ok) {
        const data = await r.json();
        return NextResponse.json(data);
      }
    } catch {}
  }

  // Workstation down or failed: list from R2.
  if (!r2Configured()) {
    return NextResponse.json(
      { error: "Storage not configured (set STORAGE_BASE_URL + STORAGE_SECRET)" },
      { status: 500 }
    );
  }
  try {
    const photos = await listR2Photos();
    return NextResponse.json(photos);
  } catch (err) {
    console.error("R2 list error:", err);
    return NextResponse.json({ error: "Failed to list photos" }, { status: 502 });
  }
}