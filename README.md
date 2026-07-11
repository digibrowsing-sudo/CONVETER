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

## Security

- No shell string interpolation with filenames — all external commands run via
  `execFile` with argument arrays.
- MIME/extension whitelist on uploads; everything else rejected with a JSON error.
- File size caps enforced by multer.
- Rate limiting per IP on the conversion endpoint.
- Uploaded and converted files are automatically deleted after `FILE_TTL_MINUTES`.

## Project status

- [x] Phase 1 — Scaffold + repo setup
- [ ] Phase 2 — Backend core (API + queue)
- [ ] Phase 3 — Conversion workers
- [ ] Phase 4 — Frontend
- [ ] Phase 5 — Deployment (VPS)
- [ ] Phase 6 — Future: auth, payments, premium tiers (not built yet)
