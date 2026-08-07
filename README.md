# FileForge

A browser-based file conversion suite with a specialised module for Indian
financial documents. Built to the
[FileForge Master Build Specification](#specification) and self-hosted on a
small VPS.

Two products share one codebase, and the split is deliberate:

- **The generic converter** — merge, split, compress, rotate, Office↔PDF. It
  will not win on head-term SEO and is not meant to. It proves the engineering,
  provides the trust surface, and costs almost nothing to run.
- **The finance module** — bank statement → Excel or Tally CSV, GST invoice
  extraction, Form 26AS parsing. Thin search competition, real willingness to
  pay. This is the business.

The first must never consume the budget, server capacity or attention the second
needs. Every limit in the code follows from that.

## What makes it different

**Most tools never upload your file.** Nine of the twenty-one run entirely in
the browser through WebAssembly — merging a PDF sends nothing anywhere. Open the
network tab and check; that is a claim iLovePDF, Smallpdf, Adobe and Nitro
cannot make.

Everything else is deleted within an hour, or within fifteen minutes for
financial documents, or the instant it is downloaded.

## Tools

Defined once in [`shared/tools.json`](shared/tools.json), which drives routes,
the homepage, the footer link web, the sitemap, SEO metadata and the API's
allow-list.

| Tier | Runs | Max file | Tools |
|---|---|---|---|
| **C** | Browser (WASM) | 100 MB | Merge, Split, Extract pages, Remove pages, Organise, Rotate, JPG→PDF, PDF→JPG, Image converter |
| **S1** | Server, fast | 25 MB | Compress, Protect (AES-256), Unlock, Repair |
| **S2** | Server, heavy | 25 MB | Word→PDF, Excel→PDF, PowerPoint→PDF, PDF→Word |
| **F** | Finance module | 15 MB | Bank statement→Excel, Bank statement→Tally CSV, GST invoice→Excel, Form 26AS→Excel |

Bank statements have dedicated parsers for **HDFC, ICICI, SBI and Kotak**, plus
a generic reader for other ruled-table formats. Every extraction is scored on
three independent signals — structural completeness, whether the running balance
is arithmetically consistent, and whether the computed closing balance matches
the printed one — and rows that fail are highlighted in the sheet itself.

## Architecture

```
Browser ─┬─ Tier C engines (pdf-lib, pdf.js, Canvas) ── never touch the server
         │
         └─ HTTPS ── Nginx ─┬─ static, prerendered pages
                            └─ /api/v1 ── Express
                                            ├── Redis (BullMQ, rate limits, job state)
                                            ├── worker-doc      concurrency 1
                                            └── worker-finance  concurrency 1
```

Two queues, not one: a finance job must never wait behind a 90-second
PowerPoint render. Concurrency is 1 on each because the box has 2 vCPU shared
with other systems, one of which belongs to a paying client.

**Stack.** React 18 + Vite + TypeScript (strict) on the front; Node 20 +
Express + BullMQ + Redis on the back; LibreOffice, Ghostscript, qpdf, poppler,
pdf2docx, pdfplumber and openpyxl as engines; PM2 and Nginx to run it.

## Local development

### Prerequisites

- Node.js 20+
- Redis on `127.0.0.1:6379`
- Conversion binaries, for the server-side tools only:
  `./scripts/install-deps.sh` installs everything including the Indic fonts that
  keep Hindi, Gujarati and Marathi documents from rendering as empty boxes.

The Tier C tools need none of this — they run in the browser.

### Run it

```bash
cp .env.example .env          # DOWNLOAD_SIGNING_SECRET is generated in dev
cd backend  && npm install
cd ../frontend && npm install

# three terminals
cd backend   && npm run dev
cd backend   && npm run worker:doc
cd frontend  && npm run dev            # http://localhost:5173
```

The dev server proxies `/api` to port 8095. Add `npm run worker:finance` when
working on the finance module.

### Tests

```bash
cd backend && npm test        # 35 node tests + 12 python tests
cd frontend && npm run build  # typecheck, build, prerender 29 pages
```

The backend tests inject fakes for Redis and BullMQ, so no services are needed.

## API

Base `/api/v1`. Full contract in the specification, section 7.

```
POST   /v1/jobs?tool=<slug>     multipart: files[], options, consent
GET    /v1/jobs/:id             poll; returns a signed download URL when done
DELETE /v1/jobs/:id             immediate purge — the user-facing delete button
GET    /v1/jobs/:id/download?t= HMAC-signed, expiring, always an attachment
GET    /v1/health               queue depth and worker liveness
GET    /v1/tools                the catalogue, generated from the registry
```

Errors carry a stable code (`FILE_TOO_LARGE`, `BANK_UNSUPPORTED`, `QUEUE_FULL`,
…) that clients switch on. Tier C tools are refused: they have no server path.

## Adding a tool

Add one object to `shared/tools.json`. The route, homepage card, footer link,
sitemap entry, page metadata, FAQ markup and API allow-list all follow from it.
The registry is validated at boot, so an error fails immediately rather than
quietly 404ing a page you were trying to rank.

A server-side tool additionally needs a processor in
`backend/src/queue/workers/` and a Zod schema in
`backend/src/validation/options.js`; both are checked at startup.

## Documentation

- [`docs/SECURITY.md`](docs/SECURITY.md) — controls, and what is still open
- [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — alerts, deploys, incident handling
- [`docs/ADR/`](docs/ADR/README.md) — decisions, including where this
  implementation deviates from the spec and why

## Not built yet

Named here rather than left to be discovered:

- **Postgres and Drizzle.** Job state is in Redis with a TTL, which is right for
  the job lifecycle but means the durable analytics tables in spec 6 do not
  exist yet (ADR-010).
- **TypeScript backend and pnpm workspaces.** Deferred as its own change
  (ADR-010).
- **OCR**, **HTML/URL→PDF**, **video and audio**. The URL tool needs the full
  SSRF guard first; video is deferred to v2 as the single highest risk to a
  shared box.
- **Load test and restore test.** Both are release gates in spec 17 Phase 5 and
  neither has been run.

## Licence and Ghostscript

Ghostscript is AGPL 3.0. Per ADR-001 this repository is open source, which is
what makes commercial use of it lawful — the alternative was buying an Artifex
licence. Keep it that way, or replace the compression engine before closing the
source.

## Specification

The master build specification is the single source of truth. Where this code
and that document disagree, the document wins until it is amended — except where
an ADR records a deliberate deviation.
