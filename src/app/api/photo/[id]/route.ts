import { storageConfigured, storageUrl, authHeaders, checkGate } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  if (!checkGate(req)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!storageConfigured()) {
    return new Response("Storage not configured", { status: 500 });
  }

  const url = new URL(req.url);
  const thumb = url.searchParams.get("thumb");
  const path = `/photo/${params.id}${thumb ? "?thumb=1" : ""}`;

  try {
    const r = await fetch(storageUrl(path), {
      headers: authHeaders(),
      cache: "no-store",
    });
    if (!r.ok) {
      return new Response("Failed to fetch photo", { status: r.status });
    }
    const buf = await r.arrayBuffer();
    const type = r.headers.get("content-type") ?? "image/jpeg";
    return new Response(buf, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (err) {
    console.error("Storage photo proxy error:", err);
    return new Response("Storage server unreachable", { status: 502 });
  }
}