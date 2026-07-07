// Home storage server for the Margareta & Neno wedding gallery.
// Exposed to the Vercel app via a Cloudflare Tunnel.
//
// Endpoints (all require x-gallery-secret header matching STORAGE_SECRET):
//   POST /upload        multipart "file"  -> saves original + thumbnail
//   GET  /photos                        -> JSON list, newest first
//   GET  /photo/:id?thumb=1             -> image bytes
//   GET  /health                        -> { ok: true } (no auth)

import express from "express";
import multer from "multer";
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHOTOS_DIR = path.join(__dirname, "photos");
const THUMBS_DIR = path.join(__dirname, "thumbs");
const META_FILE = path.join(__dirname, "photos.json");

const SECRET = process.env.STORAGE_SECRET || "change-me-please";
const PORT = Number(process.env.PORT || 8787);
const BIND_ADDR = process.env.BIND_ADDR || "127.0.0.1";
const MAX_BYTES = 60 * 1024 * 1024; // generous; client compresses to ~1-2 MB

// --- R2 config (for reconciliation: pull R2 objects back to disk on boot) ---
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY || "";
const R2_SECRET_KEY = process.env.R2_SECRET_KEY || "";
const R2_ENDPOINT = process.env.R2_ENDPOINT || "";
const R2_BUCKET = process.env.R2_BUCKET || "margareta-backup";

let r2 = null;
if (R2_ACCESS_KEY && R2_SECRET_KEY && R2_ENDPOINT) {
  r2 = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
  });
  console.log("R2 reconciliation enabled:", R2_BUCKET);
} else {
  console.log("R2 reconciliation disabled (no creds)");
}

// On boot: pull any objects in R2 that are missing from disk (e.g. photos
// uploaded while the workstation was down). Non-blocking, runs in bg.
async function reconcileFromR2() {
  if (!r2) return;
  try {
    let token;
    do {
      const res = await r2.send(new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        ContinuationToken: token,
        MaxKeys: 500,
      }));
      for (const obj of res.Contents || []) {
        const key = obj.Key;
        if (key.startsWith("photos/")) {
          const filename = key.slice("photos/".length);
          const localPath = path.join(PHOTOS_DIR, filename);
          try {
            await fs.access(localPath);
          } catch {
            // Missing locally — pull from R2.
            console.log("Reconciling from R2:", filename);
            const getRes = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
            const buf = Buffer.from(await getRes.Body.transformToByteArray());
            await fs.writeFile(localPath, buf);
            // Also pull thumbnail if it exists.
            const thumbKey = "thumbs/" + filename.replace(/\.[^.]+$/, "") + ".webp";
            // Reconstruct metadata entry.
            const id = filename.split("__")[0];
            const meta = await readMeta();
            if (!meta.photos.find(p => p.id === id)) {
              meta.photos.unshift({
                id,
                name: filename.split("__").slice(1).join("__") || filename,
                storedName: filename,
                thumbName: id + ".webp",
                size: String(buf.length),
                mimeType: "image/jpeg",
                createdTime: obj.LastModified ? obj.LastModified.toISOString() : new Date().toISOString(),
              });
              await writeMeta(meta);
            }
          }
        } else if (key.startsWith("thumbs/")) {
          const filename = key.slice("thumbs/".length);
          const localPath = path.join(THUMBS_DIR, filename);
          try {
            await fs.access(localPath);
          } catch {
            const getRes = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
            const buf = Buffer.from(await getRes.Body.transformToByteArray());
            await fs.writeFile(localPath, buf);
          }
        }
      }
      token = res.IsTruncated ? res.NextContinuationToken : null;
    } while (token);
    console.log("R2 reconciliation complete");
  } catch (e) {
    console.warn("R2 reconciliation failed (non-fatal):", e.message);
  }
}
// Run reconciliation 5 seconds after boot (non-blocking).
setTimeout(reconcileFromR2, 5000);

const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/octet-stream", // some phones send HEIC with this
];

await fs.mkdir(PHOTOS_DIR, { recursive: true });
await fs.mkdir(THUMBS_DIR, { recursive: true });

const app = express();
app.disable("x-powered-by");

// --- CORS for direct uploads from the Vercel app ---
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (origin.includes("vercel.app") || origin.includes("margaretaineno"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-gallery-secret");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

// Raw body for /photo/:id (handled manually below).
app.use("/photos", express.json());

// --- Auth middleware: shared secret header ---
function requireSecret(req, res, next) {
  if (req.headers["x-gallery-secret"] === SECRET) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

// --- Token verification for direct uploads ---
function verifyDirectToken(req, res, next) {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "No token" });
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || !sig || Date.now() > exp) {
    return res.status(401).json({ error: "Token expired" });
  }
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  const s = SECRET + "|" + exp;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
  }
  const expected = h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
  if (sig !== expected) return res.status(401).json({ error: "Bad token" });
  next();
}

// --- Metadata helpers ---
async function readMeta() {
  try {
    const raw = await fs.readFile(META_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.photos)) return { photos: [] };
    // Drop entries whose files no longer exist on disk (corrupt/missing).
    const present = [];
    for (const p of parsed.photos) {
      if (!p || !p.storedName) continue;
      try {
        await fs.access(path.join(PHOTOS_DIR, p.storedName));
        present.push(p);
      } catch {}
    }
    return { photos: present };
  } catch {
    return { photos: [] };
  }
}
async function writeMeta(meta) {
  await fs.writeFile(META_FILE, JSON.stringify(meta, null, 2));
}

// --- Upload core logic (shared by /upload and /upload-direct) ---
async function storePhoto(buffer, originalName, mimeType) {
  const id = crypto.randomBytes(9).toString("base64url");
  const safeExt = path.extname(originalName).toLowerCase() || ".jpg";
  const safeBase = path.basename(originalName, safeExt).replace(/[^\w.\-]/g, "_").slice(0, 60);
  const storedName = `${id}__${safeBase}${safeExt}`;
  const thumbName = `${id}.webp`;

  await fs.writeFile(path.join(PHOTOS_DIR, storedName), buffer);

  // Thumbnail (max 600px wide, webp). Fallback to original on failure.
  let thumbBuffer;
  try {
    thumbBuffer = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({ width: 600, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    await fs.writeFile(path.join(THUMBS_DIR, thumbName), thumbBuffer);
  } catch (e) {
    console.warn("Thumbnail failed, using original:", e.message);
    thumbBuffer = buffer;
    await fs.writeFile(path.join(THUMBS_DIR, thumbName), buffer);
  }

  const meta = await readMeta();
  const entry = {
    id,
    name: originalName,
    storedName,
    thumbName,
    size: buffer.length,
    mimeType: mimeType || "image/jpeg",
    createdTime: new Date().toISOString(),
  };
  meta.photos.unshift(entry);
  await writeMeta(meta);

  return {
    id,
    name: originalName,
    createdTime: entry.createdTime,
    size: String(buffer.length),
    mimeType: entry.mimeType,
  };
}

// --- Upload via multipart (used by Vercel proxy /api/upload) ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
});

app.post("/upload", requireSecret, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided" });
  try {
    const result = await storePhoto(
      req.file.buffer,
      req.file.originalname || "photo",
      req.file.mimetype
    );
    res.json(result);
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Failed to store photo" });
  }
});

// --- Direct upload from browser (bypasses Vercel, full quality originals) ---
// Client gets a short-lived token from Vercel /api/upload-token, then
// POSTs the raw file here with Authorization: Bearer <token>.
// Uses multer (same as /upload) instead of express.raw for reliability.
const directUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
});

app.post("/upload-direct", verifyDirectToken, directUpload.single("file"), async (req, res) => {
  const body = req.file ? req.file.buffer : req.body;
  if (!body || (Buffer.isBuffer(body) ? body.length === 0 : true)) {
    return res.status(400).json({ error: "Empty body" });
  }
  const originalName = (req.query.name) || (req.file ? req.file.originalname : "") || "photo";
  const mimeType = (req.query.type) || (req.file ? req.file.mimetype : "") || "image/jpeg";
  try {
    const result = await storePhoto(Buffer.from(body), originalName, mimeType);
    res.json(result);
  } catch (err) {
    console.error("Direct upload error:", err);
    res.status(500).json({ error: "Failed to store photo" });
  }
});

// --- List ---
app.get("/photos", requireSecret, async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Number(req.query.pageSize) || 100, 200);
  const meta = await readMeta();
  const start = (page - 1) * pageSize;
  const slice = meta.photos.slice(start, start + pageSize);
  res.json({
    photos: slice.map((p) => ({
      id: p.id,
      name: p.name,
      thumbnail: null, // Vercel app uses /api/photo/:id?thumb=1
      createdTime: p.createdTime,
      size: String(p.size),
      mimeType: p.mimeType,
    })),
    page,
    pageSize,
    total: meta.photos.length,
    nextPageToken: start + pageSize < meta.photos.length ? String(page + 1) : null,
  });
});

// --- Serve photo (original or thumbnail) ---
app.get("/photo/:id", requireSecret, async (req, res) => {
  const { id } = req.params;
  const thumb = req.query.thumb === "1";
  const meta = await readMeta();
  const entry = meta.photos.find((p) => p.id === id);
  if (!entry) return res.status(404).send("Not found");

  try {
    if (thumb) {
      const p = path.join(THUMBS_DIR, entry.thumbName);
      res.set("Content-Type", "image/webp");
      res.set("Cache-Control", "public, max-age=86400, immutable");
      return (await fs.readFile(p)) && res.sendFile(p);
    }
    const p = path.join(PHOTOS_DIR, entry.storedName);
    res.set("Content-Type", entry.mimeType || "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400, immutable");
    res.sendFile(p);
  } catch (err) {
    res.status(404).send("File missing on disk");
  }
});

// --- Health (no auth, for tunnel checks) ---
app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, BIND_ADDR, () => {
  console.log(`Margareta storage server listening on http://${BIND_ADDR}:${PORT}`);
  console.log(`Photos dir: ${PHOTOS_DIR}`);
});