import { storageConfigured, storageUrl, authHeaders, checkGate, isStorageUp } from "@/lib/storage";
import { getR2Object, r2Configured } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  if (!checkGate(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const thumb = url.searchParams.get("thumb") === "1";

  // Try workstation first.
  if (storageConfigured() && (await isStorageUp())) {
    const path = `/photo/${params.id}${thumb ? "?thumb=1" : ""}`;
    try {
      const r = await fetch(storageUrl(path), {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (r.ok) {
        const buf = await r.arrayBuffer();
        const type = r.headers.get("content-type") ?? "image/jpeg";
        return new Response(buf, {
          headers: {
            "Content-Type": type,
            "Cache-Control": "public, max-age=86400, immutable",
          },
        });
      }
    } catch {}
  }

  // Workstation down or failed: fetch from R2.
  if (!r2Configured()) {
    return new Response("Storage not configured", { status: 500 });
  }

  // R2 key: photos/<id>__<name> or thumbs/<id>.webp
  // We don't know the exact key (includes original filename), so list
  // objects with prefix to find it.
  try {
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const { getR2, R2_BUCKET } = await import("@/lib/r2");
    const r2 = getR2();
    // For thumbnails, try thumbs/ first; if not found, serve the original.
    const prefix = thumb ? `thumbs/${params.id}` : `photos/${params.id}`;
    let res = await r2.send(
      new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, MaxKeys: 1 })
    );
    let obj = res.Contents?.[0];
    // No thumbnail in R2 → serve the original photo instead.
    if (!obj?.Key && thumb) {
      const fallbackRes = await r2.send(
        new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: `photos/${params.id}`, MaxKeys: 1 })
      );
      obj = fallbackRes.Contents?.[0];
    }
    if (!obj?.Key) return new Response("Not found in R2", { status: 404 });
    const { buffer, contentType } = await getR2Object(obj.Key);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (err) {
    console.error("R2 photo fetch error:", err);
    return new Response("Failed to fetch photo", { status: 502 });
  }
}