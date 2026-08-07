# Architecture decision records

Decisions ADR-001 to ADR-008 come from Appendix A of the master specification.
ADR-009 onward were taken while building against it, and are recorded here
because they are places where the implementation deviates from, or has to make
a call the spec left open. Amendments go at the bottom with a date.

## From the specification

| ID | Decision | Rationale |
|---|---|---|
| ADR-001 | Open-source the repository | Resolves the Ghostscript AGPL constraint; doubles as portfolio proof |
| ADR-002 | Client-side-first tiering | Server cost scales with free usage and would kill unit economics |
| ADR-003 | Drizzle over Prisma | No engine binary, lower memory on a constrained VPS |
| ADR-004 | Vite SSG over Next.js | Static pages need no Node runtime; saves RAM and Coolify complexity |
| ADR-005 | pdf2docx over LibreOffice for PDF→DOCX | LibreOffice output quality in this direction is poor |
| ADR-006 | Defer FFmpeg to v2 | Single highest risk to a shared VPS running a live client system |
| ADR-007 | No AdSense in v1 | Negative RPM-to-CWV tradeoff; incompatible with a finance-data trust position |
| ADR-008 | Finance module is the business, generic tools are the portfolio | Head-term SEO is unwinnable; the domain advantage is in finance |

## ADR-009 — Prerender with `react-dom/server` rather than adopting `vite-react-ssg`

**Status:** accepted · **Date:** 7 August 2026

Spec 4.1 names `vite-react-ssg` as the static generation library and spec 14.3
requires every tool page to exist as static HTML at build time. The requirement
is what matters; the library was a means to it.

Adopting `vite-react-ssg` would have meant restructuring routing into its own
route-object format. Instead the build runs a second Vite pass in SSR mode and a
~90-line script renders each route to `dist/<route>/index.html`, with head tags
and JSON-LD written statically. `main.tsx` hydrates the result.

This satisfies 14.3 in full — real content, unique titles, canonicals and
structured data in the HTML before any JavaScript runs — with no new dependency
and no change to how routes are declared. Revisit if the page count grows past
the point where a serial render pass is slow, or if per-page data loading is
needed.

## ADR-010 — Keep the backend in JavaScript rather than migrating to a TypeScript monorepo

**Status:** accepted · **Date:** 7 August 2026

Spec 4.2 and 5 describe a pnpm-workspace monorepo with TypeScript throughout,
Drizzle and Postgres. The existing backend is CommonJS JavaScript with
`backend/` and `frontend/` as plain directories.

Migrating the language, the package manager, the repo layout and the database
at the same time as implementing the security, tiering and finance work would
have produced one enormous change where every failure looks like every other
failure. The spec's *substance* — the registry, the tier model, the validation
chain, the retention promises, the finance module — is language-independent, so
it was implemented first.

What is deferred, and should be done as its own change:

- TypeScript across the backend, with `strict`
- pnpm workspaces and the `packages/shared`, `packages/engine-contract` split
- Postgres and Drizzle for the `jobs`, `tool_metrics_daily`, `client_tool_events`
  and `finance_jobs` tables (spec 6). Job state currently lives in Redis with a
  TTL, which is correct for the job lifecycle but means the durable analytics
  the spec wants do not yet survive a purge.

`shared/tools.json` is deliberately plain JSON rather than a TypeScript module
so both a CommonJS backend and the Vite frontend can read the same file today,
and so it needs no build step to stay the single source of truth.

## ADR-011 — Validation is hand-written rather than taken from `file-type`

**Status:** accepted · **Date:** 7 August 2026

Spec 12.1 names the `file-type` package for magic-byte sniffing. The
implementation in `backend/src/security/` does it directly instead, for three
reasons:

1. We need more than the format. Telling a DOCX from an XLSX means reading the
   zip index, and we need that index anyway for the archive-bomb guard — so the
   zip is parsed once and answers both questions.
2. The guard must never extract anything. A parser we control cannot be talked
   into writing a file somewhere it should not.
3. It is roughly 200 lines for the formats in our registry, with tests, and it
   removes a dependency from the most security-sensitive path in the product.

The trade-off is that adding a format means adding a signature by hand.

## ADR-012 — Merge and split moved from the server to the browser

**Status:** accepted · **Date:** 7 August 2026

These were server-side qpdf operations. Spec 2.2 places them in Tier C, and
ADR-002 explains why: they are among the most-used tools on a site like this,
and every run of them was costing CPU on a box shared with a paying client's
system.

They now run in a Web Worker via pdf-lib and the API refuses them outright, so
there is no path by which they can consume server capacity. This also makes the
one claim none of our competitors can make — "your file never leaves your
device" — literally true and verifiable in the network tab, which spec 14.5
identifies as the differentiator to lead with.

The cost is a larger JavaScript payload, loaded only when a file is actually
dropped, and a memory ceiling set by the browser rather than the server. The
progressive fallback in spec 9.4 covers the second: if the browser cannot cope,
the user is offered the server instead of a dead end.

## ADR-013 — Passwords reach qpdf through an argument file, not argv

**Status:** accepted · **Date:** 7 August 2026

Spec 12.4 requires engines to be spawned with an argument array and no shell,
which the implementation does. But an argument array is still visible in the
process list, and Protect PDF and Unlock PDF both take a user password.

Passwords are therefore written to a mode-0600 file in the job's own scratch
directory and passed as `qpdf @file`, then deleted immediately. This keeps them
out of `ps` output for any other user on a shared box, and out of any crash
dump that captures a command line.
