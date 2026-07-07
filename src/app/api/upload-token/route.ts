import { NextResponse } from "next/server";
import { checkGate, storageUrl, isStorageUp } from "@/lib/storage";
import { getR2, R2_BUCKET, r2Configured } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns upload instructions for the client.
 * 1. Probes the home storage server. If UP → direct upload (token + URL).
 *  2. If DOWN → presigned R2 PUT URL (client uploads directly to R2).
 */
export async function POST(req: Request) {
  if (!checkGate(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storageUp = await isStorageUp();

  if (storageUp) {
    // Workstation is up: direct upload via tunnel.
    const base = process.env.STORAGE_BASE_URL!;
    const secret = process.env.STORAGE_SECRET!;
    const exp = Date.now() + 2 * 60 * 1000;
    const token = signToken(secret, exp);
    return NextResponse.json({
      mode: "direct" as const,
      url: base.replace(/\/$/, ""),
      token,
      exp,
    });
  }

  // Workstation is down: upload to R2 instead.
  if (!r2Configured()) {
    return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
  }
  const id = cryptoRandomId();
  const exp = Date.now() + 5 * 60 * 1000;
  const r2 = getR2();
  const key = `photos/${id}__upload.jpg`;
  const putUrl = await getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: "image/jpeg" }),
    {
      expiresIn: 300,
      // Disable checksum — AWS SDK v3.620+ adds x-amz-checksum-crc32 to
      // presigned URLs by default, which R2 rejects on PUT with a real body.
      signableHeaders: new Set(["host", "content-type"]),
      unsignableHeaders: new Set(["x-amz-checksum-crc32", "x-amz-sdk-checksum-algorithm"]),
    }
  );
  return NextResponse.json({
    mode: "r2" as const,
    putUrl,
    key,
    id,
    exp,
  });
}

function cryptoRandomId() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function signToken(secret: string, exp: number): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  const s = secret + "|" + exp;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
  }
  return exp + "." + h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}