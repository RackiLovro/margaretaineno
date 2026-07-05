"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Photo = {
  id: string;
  name: string;
  thumbnail?: string;
  createdTime?: string;
  size?: string;
  mimeType?: string;
};

type PhotosResp = {
  photos: Photo[];
  nextPageToken?: string | null;
  error?: string;
};

export default function Page() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<Photo | null>(null);
  const [progress, setProgress] = useState<string>("");
  const fileInput = useRef<HTMLInputElement>(null);

  const { key: gateKey, ready } = useGateKey();

  const loadPhotos = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/photos${gateKey ? `?k=${gateKey}` : ""}`);
      const data: PhotosResp = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to load");
      setPhotos(data.photos);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [gateKey, ready]);

  useEffect(() => {
    if (ready) loadPhotos();
  }, [ready, loadPhotos]);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      setUploading(true);
      setError(null);
      const arr = Array.from(files);
      let ok = 0;
      for (let i = 0; i < arr.length; i++) {
        const file = arr[i];
        setProgress(`Slanje ${i + 1}/${arr.length}: ${file.name}`);
        const fd = new FormData();
        fd.append("file", file);
        try {
          const r = await fetch(
            `/api/upload${gateKey ? `?k=${gateKey}` : ""}`,
            { method: "POST", body: fd }
          );
          if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            throw new Error(j.error || `Upload failed (${r.status})`);
          }
          ok++;
        } catch (e) {
          setError((e as Error).message);
        }
      }
      setProgress("");
      setUploading(false);
      if (ok > 0) {
        await loadPhotos();
      }
    },
    [gateKey, loadPhotos]
  );

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length) {
      uploadFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  };

  // Lightbox keyboard nav
  useEffect(() => {
    if (!lightbox) return;
    const idx = photos.findIndex((p) => p.id === lightbox.id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight" && idx < photos.length - 1)
        setLightbox(photos[idx + 1]);
      if (e.key === "ArrowLeft" && idx > 0) setLightbox(photos[idx - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, photos]);

  return (
    <main className="relative overflow-hidden">
      <Hero />

      <section className="relative z-10 mx-auto -mt-10 max-w-5xl px-4">
        <UploadCard
          onPick={() => fileInput.current?.click()}
          onDrop={handleDrop}
          uploading={uploading}
          progress={progress}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleInput}
        />
      </section>

      <section className="relative z-10 mx-auto mt-12 max-w-6xl px-4 pb-24">
        <SectionHeading
          title="Galerija"
          subtitle="Slike koje su podijelili vaši gosti"
        />

        {error && (
          <div className="mx-auto mb-6 max-w-xl rounded-lg border border-sunset-400/40 bg-sunset-500/10 px-4 py-3 text-center text-sm text-sunset-200">
            {error}
          </div>
        )}

        {loading ? (
          <SkeletonGrid />
        ) : photos.length === 0 ?(
          <EmptyState onPick={() => fileInput.current?.click()} />
        ) : (
          <div className="masonry columns-2 sm:columns-3 md:columns-4">
            {photos.map((p) => (
              <PhotoCard key={p.id} photo={p} gateKey={gateKey} onClick={() => setLightbox(p)} />
            ))}
          </div>
        )}
      </section>

      <Footer />

      {lightbox && (
      <Lightbox
        photo={lightbox}
        gateKey={gateKey}
        onClose={() => setLightbox(null)}
          onPrev={() => {
            const i = photos.findIndex((p) => p.id === lightbox.id);
            if (i > 0) setLightbox(photos[i - 1]);
          }}
          onNext={() => {
            const i = photos.findIndex((p) => p.id === lightbox.id);
            if (i < photos.length - 1) setLightbox(photos[i + 1]);
          }}
        />
      )}
    </main>
  );
}

/* ---------- Hero ---------- */
function Hero() {
  // Animate each letter of "Margareta" and "Neno" with a stagger.
  const margareta = "Margareta".split("");
  const neno = "Neno".split("");
  const baseDelay = 0.15;
  const letterStep = 0.06;
  // ampersand appears after "Margareta"
  const ampDelay = baseDelay + margareta.length * letterStep + 0.05;
  // "Neno" starts after ampersand
  const nenoStart = ampDelay + 0.15;

  return (
    <header className="sunset-aura relative flex min-h-[88vh] flex-col items-center justify-center px-4 text-center">
      <div className="relative z-10 flex flex-col items-center">
        <p className="mb-4 font-display text-sm uppercase tracking-[0.5em] text-gold sm:text-base animate-fadeUp" style={{ animationDelay: "0.05s" }}>
          11.7.2026
        </p>
        <h1 className="font-display text-5xl font-semibold leading-none text-cream sm:text-7xl md:text-8xl">
          <span className="inline-flex">
            {margareta.map((ch, i) => (
              <span
                key={i}
                className="shimmer-text inline-block animate-fadeUp"
                style={{ animationDelay: `${baseDelay + i * letterStep}s` }}
              >
                {ch}
              </span>
            ))}
          </span>
          <span
            className="mx-3 inline-block text-gold/70 animate-fadeUp"
            style={{ animationDelay: `${ampDelay}s` }}
          >
            &amp;
          </span>
          <span className="inline-flex">
            {neno.map((ch, i) => (
              <span
                key={i}
                className="shimmer-text inline-block animate-fadeUp"
                style={{ animationDelay: `${nenoStart + i * letterStep}s` }}
              >
                {ch}
              </span>
            ))}
          </span>
        </h1>
        <p
          className="mt-8 max-w-md font-body text-sm font-light leading-relaxed text-cream/80 sm:text-base animate-fadeUp"
          style={{ animationDelay: `${nenoStart + neno.length * letterStep + 0.2}s` }}
        >
          Podijelite svoje najljepše trenutke s nama.
        </p>
      </div>

      <div
        className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 animate-pulse text-gold/70 animate-fadeUp"
        style={{ animationDelay: `${nenoStart + neno.length * letterStep + 0.5}s` }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </header>
  );
}

/* ---------- Section heading ---------- */
function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-8 text-center">
      <h2 className="font-display text-3xl text-cream sm:text-4xl">{title}</h2>
      <p className="mt-1 font-display text-sm italic text-gold/80">{subtitle}</p>
    </div>
  );
}

/* ---------- Upload card ---------- */
function UploadCard({
  onPick,
  onDrop,
  uploading,
  progress,
}: {
  onPick: () => void;
  onDrop: (e: React.DragEvent) => void;
  uploading: boolean;
  progress: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={uploading ? undefined : onPick}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        setHover(false);
        onDrop(e);
      }}
      className={`group cursor-pointer rounded-2xl border-2 border-dashed bg-white/5 px-6 py-10 text-center backdrop-blur-md transition ${
        hover ? "border-gold bg-gold/10" : "border-gold/40"
      } ${uploading ? "pointer-events-none opacity-70" : ""}`}
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-gold">
        {uploading ? (
          <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 16V4M5 11l7-7 7 7M5 20h14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <p className="font-display text-xl text-cream">
        {uploading ? progress || "Slanje..." : "Dodaj fotografije"}
      </p>
      <p className="mt-1 font-body text-xs text-cream/60">
        Dodirnite za odabir ili povucite slike ovdje · max 25 MB
      </p>
    </div>
  );
}

/* ---------- Photo card ---------- */
function PhotoCard({
  photo,
  gateKey,
  onClick,
}: {
  photo: Photo;
  gateKey: string;
  onClick: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const qs = gateKey ? `?k=${gateKey}` : "";
  const thumb = photo.thumbnail
    ? `${photo.thumbnail}${gateKey ? `&k=${gateKey}` : ""}`
    : `/api/photo/${photo.id}?thumb=1${gateKey ? `&k=${gateKey}` : ""}`;
  return (
    <button
      onClick={onClick}
      className="relative block w-full overflow-hidden rounded-lg bg-white/5 transition hover:scale-[1.02]"
    >
      {!loaded && (
        <div className="aspect-square w-full animate-pulse bg-white/10" />
      )}
      <img
        src={thumb}
        alt={photo.name}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`w-full object-cover transition duration-700 ${
          loaded ? "opacity-100 scale-100" : "opacity-0 scale-105 absolute inset-0"
        }`}
      />
    </button>
  );
}

/* ---------- Lightbox ---------- */
function Lightbox({
  photo,
  gateKey,
  onClose,
  onPrev,
  onNext,
}: {
  photo: Photo;
  gateKey: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fadeUp"
      onClick={onClose}
    >
      <button
        onClick={onPrev}
        className="absolute left-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-cream hover:bg-white/20"
      >
        ‹
      </button>
      <img
        src={`/api/photo/${photo.id}${gateKey ? `?k=${gateKey}` : ""}`}
        alt={photo.name}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
      />
      <button
        onClick={onNext}
        className="absolute right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-cream hover:bg-white/20"
      >
        ›
      </button>
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-cream hover:bg-white/20"
      >
        ✕
      </button>
      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-cream/60">
        {photo.name}
      </p>
    </div>
  );
}

/* ---------- Empty state ---------- */
function EmptyState({ onPick }: { onPick: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-gold/30 bg-white/5 px-8 py-12 text-center">
      <p className="font-display text-2xl text-cream">Još nema fotografija</p>
      <p className="mt-2 font-body text-sm text-cream/70">
        Budite prvi koji će podijeliti uspomenu s našeg vjenčanja.
      </p>
      <button
        onClick={onPick}
        className="mt-6 rounded-full bg-gold px-6 py-2 font-display text-sm text-wine-dark hover:bg-gold/90"
      >
        Dodaj prvu sliku
      </button>
    </div>
  );
}

/* ---------- Skeleton ---------- */
function SkeletonGrid() {
  return (
    <div className="masonry columns-2 sm:columns-3 md:columns-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="mb-3 aspect-[3/4] w-full animate-pulse rounded-lg bg-white/10"
          style={{ aspectRatio: `${i % 3 === 0 ? "1" : "3/4"}` }}
        />
      ))}
    </div>
  );
}

/* ---------- Footer ---------- */
function Footer() {
  return (
    <footer className="relative z-10 border-t border-gold/20 py-10 text-center">
      <p className="font-display text-lg italic text-gold">S ljubavlju, Margareta &amp; Neno</p>
      <p className="mt-1 font-body text-xs text-cream/50">
        Šibenik · {new Date().getFullYear()}
      </p>
    </footer>
  );
}

/* ---------- Helper: password from ?k= if present ---------- */
// Returns "" when there is no gate (GALLERY_PASSWORD unset) and
// null while we're still reading from URL/sessionStorage.
// Anything else means we have a key to use.
function useGateKey() {
  const [key, setKey] = useState<string | null>(null);
  const [gated, setGated] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    const fromUrl = u.searchParams.get("k");
    try {
      const stored = sessionStorage.getItem("gateKey");
      const k = fromUrl ?? stored ?? "";
      if (fromUrl) sessionStorage.setItem("gateKey", fromUrl);
      // Probe the server: does it require a gate at all?
      fetch("/api/photos")
        .then((r) => {
          setGated(r.status === 401);
          setKey(k);
        })
        .catch(() => {
          setGated(false);
          setKey(k);
        });
    } catch {
      setKey("");
    }
  }, []);
  // If the server has no gate, "" is a valid key (no auth needed).
  // If it does, we need a non-empty key.
  const ready = key !== null && (!gated || key !== "");
  return { key: key ?? "", ready };
}