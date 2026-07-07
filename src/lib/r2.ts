import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";

const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY || "";
const R2_SECRET_KEY = process.env.R2_SECRET_KEY || "";
const R2_ENDPOINT = process.env.R2_ENDPOINT || "";
const R2_BUCKET = process.env.R2_BUCKET || "margareta-backup";

let client: S3Client | null = null;

export function r2Configured() {
  return Boolean(R2_ACCESS_KEY && R2_SECRET_KEY && R2_ENDPOINT);
}

export function getR2(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
    // Disable request checksums — AWS SDK v3.620+ adds x-amz-checksum-crc32
    // to presigned URLs by default. R2 rejects uploads when the checksum
    // doesn't match (it's computed on empty content, not the real file).
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

export { R2_BUCKET };

type R2Object = { Key?: string; Size?: number; LastModified?: Date };

export async function listR2Photos(): Promise<{ photos: any[]; nextPageToken: null }> {
  const r2 = getR2();
  const res = await r2.send(
    new ListObjectsV2Command({ Bucket: R2_BUCKET, MaxKeys: 200 })
  );
  const objects: R2Object[] = (res.Contents as R2Object[]) || [];
  // Only photos/ objects, newest first.
  const photoObjs = objects
    .filter((o) => o.Key?.startsWith("photos/"))
    .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));
  return {
    photos: photoObjs.map((o) => {
      const key = o.Key!;
      const filename = key.slice("photos/".length);
      const id = filename.split("__")[0];
      const name = filename.split("__").slice(1).join("__") || filename;
      return {
        id,
        name,
        thumbnail: null,
        createdTime: o.LastModified?.toISOString() ?? new Date().toISOString(),
        size: String(o.Size ?? 0),
        mimeType: "image/jpeg",
      };
    }),
    nextPageToken: null,
  };
}

export async function getR2Object(key: string): Promise<{ buffer: Buffer; contentType: string }> {
  const r2 = getR2();
  const res = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  const buf = Buffer.from(await res.Body!.transformToByteArray());
  const contentType = res.ContentType || "image/jpeg";
  return { buffer: buf, contentType };
}