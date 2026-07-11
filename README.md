# FileForge — Self-Hosted File Converter

A self-hosted file conversion web application (like iLovePDF). Converts documents, images,
and PDFs between formats. Built to run on an Ubuntu VPS with Nginx + PM2, monetization-ready:
each tool on its own URL, rate limiting, and file limits from day one.

## Tools

| Tool | Route | Engine |
|---|---|---|
| Word/Office → PDF | `/word-to-pdf` | LibreOffice (headless) |
| PDF → Word | `/pdf-to-word` | pdf2docx (Python) |
| Compress PDF | `/compress-pdf` | Ghostscript |
| Merge PDF | `/merge-pdf` | qpdf |
| Split PDF | `/split-pdf` | qpdf |
| Image converter | `/image-converter` | sharp |

## Tech stack

- **Frontend:** React 18 + Vite + TypeScript, TailwindCSS
- **Backend:** Node.js 20+ + Express, BullMQ + Redis job queue
- **Conversion:** LibreOffice, Ghostscript, qpdf, pdf2docx, sharp
- **Deployment:** PM2 + Nginx on Ubuntu

## Local development

### Prerequisites

- Node.js 20+
- Redis running on `127.0.0.1:6379` (`sudo apt install redis-server`)
- Conversion binaries (only needed for the tools you exercise):
  `sudo apt install libreoffice --no-install-recommends ghostscript qpdf`
  and `pip3 install pdf2docx`

On a fresh Ubuntu machine you can run `scripts/install-deps.sh` to install everything.

### Setup

```bash
# 1. Environment
cp .env.example .env

# 2. Backend (API on http://localhost:8095)
cd backend
npm install
npm run dev

# 3. Frontend (dev server on http://localhost:5173, proxies /api to the backend)
cd frontend
npm install
npm run dev
```

### Configuration

All limits and paths live in `.env` (see `.env.example`) and are read in one place,
`backend/src/config.js` — no magic numbers in code.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8095` | API port |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection |
| `MAX_FILE_SIZE_MB` | `50` | Upload size cap |
| `FILE_TTL_MINUTES` | `60` | Uploaded/converted files auto-delete after this |
| `RATE_LIMIT_MAX` | `30` | Conversion requests per window per IP |
| `RATE_LIMIT_WINDOW_MIN` | `15` | Rate-limit window (minutes) |
| `STORAGE_PATH` | `./storage` | Where uploads/converted files are kept |

## Conversion test results

Each worker was exercised end-to-end (upload → queue → worker → download)
against a live Redis with sample files:

| Tool | Input | Result |
|---|---|---|
| `doc-to-pdf` | `sample.docx` (5.0 KB) | ✅ valid PDF, 9.5 KB |
| `pdf-to-word` | 1-page text PDF | ✅ valid `Microsoft Word 2007+` DOCX |
| `pdf-to-word` | corrupt PDF | ✅ fails gracefully: “This PDF could not be converted — it may be scanned or image-based.” |
| `compress-pdf` | 4-page PDF, `/ebook` preset | ✅ output PDF, before/after sizes reported |
| `merge-pdf` | two 4-page PDFs | ✅ 8-page merged PDF, upload order preserved |
| `split-pdf` | pages `1-3,7` style range | ✅ single 2-page PDF for one range |
| `split-pdf` | no range given | ✅ one PDF per page, zipped |
| `image-convert` | PNG → WebP | ✅ valid WebP, EXIF orientation preserved |

Notes:

- LibreOffice must include the Writer/Calc/Impress components — the full
  `libreoffice` package installed by `scripts/install-deps.sh` covers this.
  `libreoffice-core` alone fails with “source file could not be loaded”.
- **HEIC input:** sharp needs libheif. If HEIC conversions fail on the VPS, run
  `sudo apt install -y libheif-dev` and rebuild sharp
  (`cd backend && npm rebuild sharp`).

## Security

- No shell string interpolation with filenames — all external commands run via
  `execFile` with argument arrays.
- MIME/extension whitelist on uploads; everything else rejected with a JSON error.
- File size caps enforced by multer.
- Rate limiting per IP on the conversion endpoint.
- Uploaded and converted files are automatically deleted after `FILE_TTL_MINUTES`.

## Deployment (Ubuntu VPS with Nginx + PM2)

1. Clone the repo to `/var/www/fileforge`.
2. Install system dependencies: `sudo bash scripts/install-deps.sh`
   (LibreOffice, Ghostscript, qpdf, Redis, pdf2docx).
3. Configure: `cp .env.example .env` and adjust if needed.
4. Install and build:
   ```bash
   cd /var/www/fileforge/frontend && npm ci && npm run build
   cd /var/www/fileforge/backend && npm ci --omit=dev
   ```
5. Start with PM2 (1 API process + 2 worker processes):
   ```bash
   cd /var/www/fileforge
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup   # follow the printed command so PM2 survives reboots
   ```
6. Configure Nginx: copy `nginx.conf.example` to
   `/etc/nginx/sites-available/fileforge`, set `server_name`, enable the site,
   `nginx -t && sudo systemctl reload nginx`.
7. When a domain is pointed at the server, run `sudo certbot --nginx` for SSL.
8. Later deployments: `bash scripts/deploy.sh` (pull → build → restart PM2).

## Project status

- [x] Phase 1 — Scaffold + repo setup
- [x] Phase 2 — Backend core (API + queue)
- [x] Phase 3 — Conversion workers
- [x] Phase 4 — Frontend
- [x] Phase 5 — Deployment (VPS)
- [ ] Phase 6 — Future (not built yet, TODO markers only):
  - User accounts (JWT auth) + free tier: 5 conversions/day for anonymous
    users (track by IP in Redis), unlimited for registered
  - Razorpay subscription integration (₹199/month premium tier)
  - Premium features: batch conversion, 200MB files, no daily limit,
    priority queue
  - AdSense slots on tool pages (`<AdSlot />` component placeholder)
  - OCR tool (OCRmyPDF) and FFmpeg audio/video tools
  - Usage analytics dashboard
