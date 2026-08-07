# Security

The controls in place, where they live in the code, and what is still open.
This file is also the documented evidence of "reasonable security practices"
under the IT (Reasonable Security Practices and Procedures and Sensitive
Personal Data or Information) Rules 2011 — spec 15.4 relies on it, so keep it
current.

The user-facing version of this is `/security`.

## Reporting a vulnerability

Email the address on `/contact`. Acknowledgement within 72 hours. Please do not
run automated scanners against the live service: it shares a machine with a
paying client's system, and a scan is indistinguishable from an attack.

## The strongest control

Nine of the twenty-one tools never receive the file. Merge, split, extract,
remove, reorder, rotate, JPG→PDF, PDF→JPG and image conversion run in the
browser, and the API refuses them (`registry.isServerRunnable`). There is no
code path by which those files reach a server, which is a stronger guarantee
than any amount of careful handling on our side.

## Upload validation chain

Spec 12.1, in order. All of it must pass before an engine sees a file.

| Step | Where | Notes |
|---|---|---|
| 1. Extension allowlist | `middleware/upload.js` | From the registry, per tool |
| 2. Magic-byte sniffing | `security/magic.js` | The declared Content-Type is ignored entirely |
| 3. Size cap | `middleware/upload.js` | Per tool, streamed, aborts mid-upload |
| 4. Filename regeneration | `middleware/upload.js` | Becomes `original-N.ext`; C0 controls and bidi overrides stripped from the display name |
| 5. Archive-bomb + zip-slip guard | `security/zip.js` | Every OOXML and ODF container |
| 6. PDF structure check | `security/pdfcheck.js` | `pdfinfo` must accept it; required in production |
| 7. Page limit | `security/pdfcheck.js` | 500 pages |

The size cap works mid-upload because the tool slug is sent in the query string
as well as the body — the query is known before the multipart body is parsed, so
multer is built with the right limit rather than a global one.

**Why not `file-type`:** see ADR-011.

## Engine containment

`utils/exec.js` is the only way to start an engine, and it enforces:

- an argument array, never a shell — no `exec`, no template-interpolated command
- a wall-clock timeout, always
- an address-space ceiling via `prlimit`, so an allocation loop kills the job
  rather than the box
- a minimal environment — engines never see `DOWNLOAD_SIGNING_SECRET`,
  `REDIS_URL` or anything else in the API's environment
- writes confined to the job's own scratch directory

Passwords go through a mode-0600 argument file rather than argv (ADR-013), so
they never appear in `ps`.

All Python XML parsing calls `defusedxml.defuse_stdlib()` before anything else
is imported (spec 12.2) — Office formats are XML in a zip, and the stdlib
parsers resolve external entities by default.

## Data handling

What is never collected, logged or stored:

- **Raw IP addresses.** `utils/iphash.js` hashes with a salt that includes the
  date, so the same address yields a different value tomorrow and hashes cannot
  be joined into a history.
- **File contents or extracted text.** The finance parsers return bank code, row
  count and confidence — nothing else crosses back from Python into Node, so
  nothing else can reach a log.
- **Filenames.** Renamed on arrival. The display name is kept in the job record
  only to name the download, and is never logged.
- **Passwords.** In memory for one operation.

Retention (spec 10.2) is enforced by `utils/reaper.js` on a five-minute pass:
60 minutes standard, 15 minutes for finance, 15 minutes for failures, and
immediate purge when a finance file is downloaded (`routes/download.js`). The
orphan sweep removes any directory with no live job — a crashed worker cannot
leave a bank statement behind.

`DELETE /v1/jobs/:id` purges on demand and is surfaced as a button on every
server-side result panel.

## Transport and headers

Set by `server.js` for the API and by `nginx.conf.example` for static pages:
full CSP with `wasm-unsafe-eval` and `worker-src blob:` (both required for the
browser-side engines), HSTS with preload, `nosniff`, `frame-ancestors 'none'`,
COOP, COEP and a Permissions-Policy.

Downloads are always `Content-Disposition: attachment` plus `nosniff` — never
inline. A converted file is attacker-influenced content, and rendering it in our
own origin is how a crafted SVG or HTML output becomes stored XSS.

Download URLs carry an HMAC of the job ID and an expiry
(`utils/downloadToken.js`), compared in constant time.

## Abuse limits

Per hashed IP: 5 requests/minute burst, 15/hour and 60/day for server jobs,
5/hour and 20/day for finance jobs, and a 200 MB/day upload budget. Global queue
depth is capped at 25, above which the API returns `QUEUE_FULL` rather than
accepting work that would take the box down.

Tier C is unlimited, deliberately: it costs us nothing, so limiting it would
only make the product worse.

## Open items

Tracked against the spec 18.3 checklist. These must close before the finance
module is announced:

- [ ] **SSRF guard.** Not applicable yet — the HTML/URL→PDF tool is not built.
      It is the highest-risk endpoint in the design, and spec 12.3 must be
      implemented in full (private-range blocking, DNS pinning against
      rebinding, isolated network namespace) before that tool ships. Test
      against `169.254.169.254`.
- [ ] **Internal-only network for workers.** PM2 runs everything on the host
      today. The `internal: true` Docker network in spec 12.4 requires the
      container deployment.
- [ ] **Non-root, `cap_drop: ALL` containers.** Same dependency.
- [ ] **Rate limits verified with a script**, not only by unit test.
- [ ] **Reaper verified against the disk**, not the log — check the files are
      actually gone.
- [ ] **Sentry scrubbing verified** with a deliberate test error. Error tracking
      is not wired up yet; the `beforeSend` hook in spec 13.4 must strip any
      field matching `/file|name|path|content|ip/i`.

Covered by automated tests today: magic-byte validation, the archive-bomb and
zip-slip guards, filename sanitisation, IP-hash properties, download-token
forgery and expiry, path traversal on download, per-tool size caps, consent
enforcement, and purge-on-download for finance jobs.
