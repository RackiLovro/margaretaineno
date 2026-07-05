# Margareta & Neno — Vjenčanje Šibenik

A romantic wedding photo gallery: guests upload photos from their phone, images are stored on **your own home server**, and the gallery renders them in a Šibenik‑at‑sunset theme.

**Stack:**
- **Frontend + proxy API:** Next.js 14 (App Router) + Tailwind — hosted free on Vercel.
- **Storage:** your own machine running a small Express server.
- **Tunnel:** Cloudflare Tunnel exposes the home server to Vercel over HTTPS — no port forwarding, no public IP, no credit card.

```
Phone → Vercel app → Cloudflare Tunnel → home server (disk)
```

## Why this setup

- **Free**, no card.
- **Unlimited storage** (your disk).
- **No Google account / billing** needed.
- Photos never leave your machine except through the tunnel.

**Trade‑off:** the home machine must be online during the wedding. If your home internet drops, uploads/listing fail until it's back.

## Repo layout

```
/                     Vercel app (Next.js)
  src/
    app/
      api/
        upload/route.ts      POST → proxies to home /upload
        photos/route.ts      GET  → proxies to home /photos
        photo/[id]/route.ts  GET  → proxies to home /photo/:id
      layout.tsx
      page.tsx               UI: hero, upload, masonry gallery, lightbox
      globals.css            Šibenik‑sunset theme
    lib/storage.ts           tunnel config + auth header
  .env.local.example

/home-server/          Storage server (runs on your machine)
  server.js            Express: upload, list, serve, thumbnail
  package.json
  .env.example
  photos/              (gitignored) original images
  thumbs/              (gitignored) auto‑generated webp thumbnails
  photos.json          (gitignored) metadata index
```

---

## 1. Set up the home storage server

Run this on a machine that stays online during the wedding (a NUC, old laptop, Raspberry Pi, NAS, etc.).

```bash
cd home-server
cp .env.example .env
# edit .env: set STORAGE_SECRET to a long random string
npm install
npm start
```

You should see:

```
Margareta storage server listening on http://0.0.0.0:8787
```

Test it from the same machine:

```bash
curl http://localhost:8787/health
# {"ok":true}
```

### Keep it running

Use a process manager so it survives reboots:

```bash
npm i -g pm2
pm2 start server.js --name margareta-storage
pm2 save
pm2 startup       # follow the printed instruction to enable on boot
```

---

## 2. Expose it with Cloudflare Tunnel

Cloudflare Tunnel gives your home server a public HTTPS URL without opening router ports. Free, no card.

### a. Install cloudflared

```bash
# Debian/Ubuntu
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install cloudflared

# macOS
brew install cloudflared
```

### b. Add the domain to Cloudflare

Domain: **`margaretainenozauvijek.com`**

1. Sign in / create a free Cloudflare account.
2. **Add a site** → enter `margaretainenozauvijek.com` → select the **Free** plan.
3. Cloudflare gives you two nameservers (e.g. `aria.ns.cloudflare.com`, `bert.ns.cloudflare.com`).
4. At your domain registrar, replace the existing nameservers with those two.
5. Wait for Cloudflare to confirm the domain is active (minutes to a few hours). You'll get an email.

Then log in to cloudflared:

```bash
cloudflared tunnel login
```

A browser opens — authorize `margaretainenozauvijek.com`.

### c. Create a tunnel

```bash
cloudflared tunnel create margareta-storage
```

Note the tunnel UUID and the credentials file path it prints.

### d. Configure the tunnel

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: /home/YOU/.cloudflared/<TUNNEL-UUID>.json

ingress:
  - hostname: storage.margaretainenozauvijek.com
    service: http://localhost:8787
  - service: http_status:404
```

### e. Add DNS route + run

```bash
cloudflared tunnel route dns margareta-storage storage.margaretainenozauvijek.com
cloudflared tunnel run margareta-storage
```

Test from anywhere:

```bash
curl https://storage.margaretainenozauvijek.com/health
# {"ok":true}
```

### f. Run as a service

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

Now the tunnel auto‑starts on boot alongside your storage server.

---

## 3. Configure the Vercel app

### Local dev

```bash
npm install
cp .env.local.example .env.local
# edit .env.local:
#   STORAGE_BASE_URL=https://storage.margaretainenozauvijek.com
#   STORAGE_SECRET=<same string as home server>
npm run dev
# open http://localhost:3000
```

### Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Or push to GitHub and import at <https://vercel.com/new>.

### Vercel environment variables

Project → Settings → Environment Variables:

| Key | Value |
|-----|-------|
| `STORAGE_BASE_URL` | `https://storage.margaretainenozauvijek.com` |
| `STORAGE_SECRET` | same long string as the home server |
| `GALLERY_PASSWORD` | (optional) password; guests visit with `?k=password` |

---

## Security

- All storage routes require `x-gallery-secret` header matching `STORAGE_SECRET`. Only your Vercel app knows it.
- `GALLERY_PASSWORD` (optional) adds a second gate for guests — share the URL with `?k=...` and it's cached in `sessionStorage`.
- Cloudflare Tunnel: no inbound router ports, no exposed IP. Cloudflare filters abuse automatically.
- The `/health` endpoint is the only unauthenticated route (returns only `{ok:true}`).

## Backup

`home-server/photos/` holds the originals. Back it up:

```bash
# example: rsync to an external drive nightly
rsync -av --delete home-server/photos/ /mnt/backup/margareta-photos/
```

Or use restic/Borg for encrypted incremental backups.

## Limits

- Upload body limit: 25 MB per photo (set in `next.config.mjs` and home server).
- Thumbnails: auto‑generated with `sharp` (600px wide webp). Originals kept untouched.

## Notes

- HEIC from iPhone: `sharp` converts to webp for thumbnails; the original HEIC is served in the lightbox via the proxy. Browsers that don't render HEIC natively may show a broken image — guests can still upload, and you can batch‑convert HEIC → JPG on the server later.
- The gallery is reactive: after a successful upload it refetches `/api/photos`.

---

*With love, Margareta & Neno — Šibenik.*