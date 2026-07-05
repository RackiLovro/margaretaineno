import { NextResponse } from "next/server";
import { storageConfigured } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const base = process.env.STORAGE_BASE_URL;
  const hasSecret = Boolean(process.env.STORAGE_SECRET);
  const gate = process.env.GALLERY_PASSWORD ? "set" : "unset";

  let tunnelReachable = "unknown";
  let dnsOk = "unknown";
  if (storageConfigured()) {
    try {
      const r = await fetch(`${base!.replace(/\/$/, "")}/health`, {
        signal: AbortSignal.timeout(8000),
      });
      tunnelReachable = `${r.status} ${await r.text()}`;
    } catch (e) {
      tunnelReachable = `error: ${(e as Error).message}`;
    }
  }

  return NextResponse.json({
    storageBaseUrl: base || "MISSING",
    storageSecretPresent: hasSecret,
    galleryPassword: gate,
    storageConfigured: storageConfigured(),
    tunnelReachable,
  });
}