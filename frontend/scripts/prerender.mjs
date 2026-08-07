// Write one static HTML file per route (spec 14.3).
//
// Runs after `vite build` and `vite build --ssr`. Each route is rendered once,
// its head tags are built from the metadata the page declared, and the result
// is written to dist/<route>/index.html so a crawler — and a user on a slow
// connection — sees real content before any JavaScript runs.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = join(here, '..', 'dist');
const ssrEntry = join(here, '..', 'dist-ssr', 'entry-server.js');

const SITE_URL = 'https://fileforge.in';
const SITE_NAME = 'FileForge';

/** Escape for use inside an HTML attribute or text node. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * JSON-LD sits inside a <script> element, so the one sequence that must never
 * survive is a literal "</script>". Escaping the slash keeps the JSON valid
 * while making the tag impossible to close early.
 */
function jsonLdScript(data) {
  if (!data || data.length === 0) return '';
  const payload = JSON.stringify(data.length === 1 ? data[0] : data).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${payload}</script>`;
}

function headFor(meta, route) {
  const url = `${SITE_URL}${route}`;
  const title = escapeHtml(meta?.title ?? SITE_NAME);
  const description = escapeHtml(meta?.description ?? '');
  const robots = meta?.noIndex ? 'noindex,nofollow' : 'index,follow';

  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    `<meta name="robots" content="${robots}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    jsonLdScript(meta?.jsonLd),
  ]
    .filter(Boolean)
    .join('\n    ');
}

async function main() {
  const template = await readFile(join(distDir, 'index.html'), 'utf8');
  const { render, routes } = await import(pathToFileURL(ssrEntry).href);

  let written = 0;
  for (const route of routes()) {
    const { html, meta } = render(route);

    // Replace the template's placeholder title and description wholesale
    // rather than appending, so no page ends up with two of either.
    const page = template
      .replace(/<title>[\s\S]*?<\/title>/, '<!--head-->')
      .replace(/<meta\s+name="description"[\s\S]*?>/, '')
      .replace('<!--head-->', headFor(meta, route))
      .replace('<div id="root"></div>', `<div id="root">${html}</div>`);

    const outPath = route === '/' ? join(distDir, 'index.html') : join(distDir, route, 'index.html');
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, page, 'utf8');
    written += 1;
  }

  console.log(`prerendered ${written} pages`);
}

main().catch((error) => {
  console.error('prerender failed:', error);
  process.exit(1);
});
