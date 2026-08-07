// Server entry used only by the build's prerender pass.
//
// Spec 14.3 requires every tool page to exist as static HTML: a crawler that
// has to execute JavaScript to see the FAQ block is a crawler that may not
// bother. This renders each route once at build time; the client then hydrates
// the same markup, so nothing about the running app changes.

import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';

import App from './App';
import { collectedMeta, type PageMeta } from './lib/seo';
import { TOOLS, toolPath } from './tools/registry';

export interface RenderResult {
  html: string;
  meta: PageMeta | null;
}

export function render(url: string): RenderResult {
  collectedMeta.current = null;
  const html = renderToString(
    <StrictMode>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </StrictMode>,
  );
  return { html, meta: collectedMeta.current };
}

/** Every route the build should write a file for — generated from the registry. */
export function routes(): string[] {
  return [
    '/',
    '/finance',
    ...TOOLS.map(toolPath),
    '/privacy',
    '/terms',
    '/security',
    '/refund',
    '/contact',
    '/dmca',
  ];
}
