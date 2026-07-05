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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHOTOS_DIR = path.join(__dirname, "photos");
const THUMBS_DIR = path.join(__dirname, "thumbs");
const META_FILE = path.join(__dirname, "photos.json");

const SECRET = process.env.STORAGE_SECRET || "change-me-please";
const PORT = Number(process.env.PORT || 8787);
const MAX_BYTES = 25 * 1024 * 1024;

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

// Raw body for /photo/:id (handled manually below).
app.use("/photos", express.json());

// --- Auth middleware ---
function requireSecret(req, res, next) {
  if (req.headers["x-gallery-secret"] === SECRET) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

// --- Metadata helpers ---
async function readMeta() {
  try {
    return JSON.parse(await fs.readFile(META_FILE, "utf8"));
  } catch {
    return { photos: [] };
  }
}
async function writeMeta(meta) {
  await fs.writeFile(META_FILE, JSON.stringify(meta, null, 2));
}

// --- Upload ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
});

app.post("/upload", requireSecret, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided" });

  const id = crypto.randomBytes(9).toString("base64url");
  const originalName = req.file.originalname || "photo";
  const safeExt = path.extname(originalName).toLowerCase() || ".jpg";
  const safeBase = path.basename(originalName, safeExt).replace(/[^\w.\-]/g, "_").slice(0, 60);
  const storedName = `${id}__${safeBase}${safeExt}`;
  const thumbName = `${id}.webp`;

  try {
    await fs.writeFile(path.join(PHOTOS_DIR, storedName), req.file.buffer);

    // Generate a thumbnail (max 600px wide, webp). Fallback to original on failure.
    try {
      await sharp(req.file.buffer, { failOn: "none" })
        .rotate()
        .resize({ width: 600, withoutEnlargement: true })
        .webp({ quality: 75 })
        .toFile(path.join(THUMBS_DIR, thumbName));
    } catch (e) {
      console.warn("Thumbnail failed, using original:", e.message);
      await fs.writeFile(path.join(THUMBS_DIR, thumbName), req.file.buffer);
    }

    const meta = await readMeta();
    const entry = {
      id,
      name: originalName,
      storedName,
      thumbName,
      size: req.file.size,
      mimeType: req.file.mimetype || "image/jpeg",
      createdTime: new Date().toISOString(),
    };
    meta.photos.unshift(entry);
    await writeMeta(meta);

    res.json({
      id,
      name: originalName,
      createdTime: entry.createdTime,
      size: String(req.file.size),
      mimeType: entry.mimeType,
    });
  } catch (err) {
    console.error("Upload error:", err);
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

app.listen(PORT, () => {
  console.log(`Margareta storage server listening on http://0.0.0.0:${PORT}`);
  console.log(`Photos dir: ${PHOTOS_DIR}`);
});