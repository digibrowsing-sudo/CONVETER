# FileForge runbook

Operational notes for the person on the other end of a 2am alert. FileForge
shares a 2 vCPU / 8 GB box with EMS, ARIA, the investment bot and Coolify. EMS
belongs to a paying client. **When FileForge and EMS compete for the machine,
FileForge loses** — every limit below exists to make that automatic rather than
a judgement call.

## Processes

| Process | What it does | Restart |
|---|---|---|
| `fileforge-api` | HTTP API, upload validation, reaper | `pm2 restart fileforge-api` |
| `fileforge-worker-doc` | LibreOffice, Ghostscript, qpdf, pdf2docx, sharp | `pm2 restart fileforge-worker-doc` |
| `fileforge-worker-finance` | Python finance parsers | `pm2 restart fileforge-worker-finance` |

The frontend is static files served by Nginx; it has no process.

## Health

```bash
curl -s localhost:8095/api/v1/health | jq
```

```json
{ "ok": true, "version": "0.1.0", "queueDepth": 0,
  "workers": { "doc": "up", "finance": "up" } }
```

Returns **503** when a worker's heartbeat has lapsed or the queue is over its
depth limit. Workers refresh their heartbeat every 10 seconds with a 30-second
TTL, so `"down"` means a worker has been gone for at least half a minute — it is
not a transient blip.

## Alerts and what to do about them

### `queueDepth` climbing, or `QUEUE_FULL` returned to users

Backpressure is working. The API returns 503 rather than accepting work the box
cannot do. Check what is at the head of the queue:

```bash
redis-cli --scan --pattern 'bull:ff-doc:*' | head
pm2 logs fileforge-worker-doc --lines 100
```

Usually one large document is holding the queue. It has a hard timeout (180s for
S2), so it will clear itself. If it does not, the worker is wedged — restart it;
the job is retried or fails cleanly.

### Disk pressure

The reaper warns at 75% and purges aggressively at 80%, oldest first. If it is
firing repeatedly, something is not being cleaned:

```bash
du -sh storage/in storage/out storage/tmp
find storage -maxdepth 2 -type d -mmin +120   # anything older than the longest TTL
```

Directories older than two hours mean the reaper is failing, not that traffic is
high. Check the API log for `reaper pass failed`.

**Do not** delete `storage/` wholesale while jobs are running; use the reaper:

```bash
node -e "
const config=require('./backend/src/config');
const {createReaper}=require('./backend/src/utils/reaper');
const {createJobStore}=require('./backend/src/utils/jobstore');
const {createRedisConnection}=require('./backend/src/queue/producers');
const redis=createRedisConnection(config);
createReaper({config,logger:console,jobstore:createJobStore(redis,config),redis})
  .runOnce().then(r=>{console.log(r);process.exit(0)});
"
```

### Memory

Each engine already runs under a `prlimit` address-space cap, so a runaway
converter kills its own job rather than the box. If a *worker process* is
growing instead, PM2's `max_memory_restart` catches it. Persistent growth is a
leak — capture `pm2 monit` output before restarting.

### `BANK_UNSUPPORTED` failures

Not an incident. This is the product's roadmap arriving as telemetry: it tells
you exactly which bank to write a parser for next.

```bash
pm2 logs fileforge-worker-finance --lines 2000 --nostream \
  | grep BANK_UNSUPPORTED | jq -r .toolSlug | sort | uniq -c
```

Detection scores are logged with each failure, so a format that only just missed
recognition is visible rather than silent.

### Confidence scores falling

A bank has changed its statement layout (risk R8). Confidence is logged with
every finance job. A drop concentrated on one `bankCode` means that bank's
parser needs attention; a drop across all of them means something changed on our
side.

## Common tasks

### Deploy

```bash
git pull
cd backend  && npm ci --omit=dev
cd ../frontend && npm ci && npm run build
pm2 restart ecosystem.config.js
curl -sf localhost:8095/api/v1/health || echo "HEALTH CHECK FAILED — roll back"
```

`npm run build` prerenders all 29 pages and regenerates `sitemap.xml`. Workers
drain gracefully on restart: the job in hand finishes first.

### Add a tool

Add one object to `shared/tools.json`. Route, homepage card, footer link,
sitemap entry, SEO metadata, FAQ markup and the API's allow-list all follow.
The registry is validated at boot, so a mistake fails immediately and loudly
rather than 404ing a page months later. A server-side tool also needs a
processor in `backend/src/queue/workers/` and an options schema in
`backend/src/validation/options.js` — both are checked at startup.

### Purge a specific job by hand

```bash
curl -X DELETE localhost:8095/api/v1/jobs/<job-id>
```

This is the same endpoint the user's "delete now" button calls.

### Rotate the download signing secret

```bash
openssl rand -hex 32
```

Put it in `DOWNLOAD_SIGNING_SECRET` and restart the API. Download links already
issued stop working immediately — do this only in response to a suspected leak,
and expect a burst of `INVALID_TOKEN` from users mid-download.

## What we do not have yet

- **No Postgres.** Job state lives in Redis with a TTL. The durable analytics
  tables in spec 6 are not built (ADR-010), so tool-usage history does not
  survive a purge.
- **No OCR.** Scanned PDFs fail with a clear message rather than being
  processed.
- **No video or audio conversion.** Deferred to v2 (ADR-006) — a single large
  transcode would saturate both vCPUs for minutes.
- **No load test on record.** Spec 17 Phase 5 requires 20 concurrent server jobs
  with EMS confirmed healthy throughout. Do this before announcing the site.
- **No restore test on record.** A backup that has never been restored is a
  hypothesis, not a backup.
