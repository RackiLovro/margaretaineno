"use client";

import { useEffect, useState } from "react";

export default function EnterPage() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Pull ?next= so we know where to land after auth.
  const [next, setNext] = useState("/");
  useEffect(() => {
    const u = new URL(window.location.href);
    setNext(u.searchParams.get("next") || "/");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: pw, next }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error || "Kriva lozinka");
        return;
      }
      // Cookie set; navigate to where we came from.
      window.location.href = next;
    } catch {
      setErr("Nešto je pošlo po krivu");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6">
      <div className="relative z-10 w-full max-w-sm text-center">
        <div className="mx-auto mb-6 h-px w-12 bg-gold/60" />
        <p className="font-display text-2xl text-cream">Dobrodošli</p>
        <p className="mt-2 font-body text-sm text-cream/60">
          Unesite lozinku za pristup galeriji.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-3">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
            placeholder="Lozinka"
            className="w-full rounded-lg border border-gold/40 bg-white/5 px-4 py-3 text-center font-body text-cream placeholder:text-cream/40 focus:border-gold focus:outline-none"
          />
          {err && (
            <p className="text-sm text-sunset-300">{err}</p>
          )}
          <button
            type="submit"
            disabled={loading || !pw}
            className="w-full rounded-full bg-gold px-6 py-3 font-display text-sm text-wine-dark hover:bg-gold/90 disabled:opacity-50"
          >
            {loading ? "Provjera..." : "Uđi"}
          </button>
        </form>
        <div className="mx-auto mt-6 h-px w-12 bg-gold/60" />
      </div>
    </main>
  );
}