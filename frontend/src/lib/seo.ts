// Per-page metadata and structured data (spec 14.3).
//
// These pages are the SEO surface, so every one needs a unique title and
// description, a canonical URL and the right JSON-LD. All of it is generated
// from the registry rather than written per page, so a new tool arrives fully
// marked up without anyone remembering to do it.

import { useEffect } from 'react';
import type { ToolDef } from '../tools/registry';
import { toolPath } from '../tools/registry';

export const SITE_NAME = 'FileForge';
export const SITE_URL = 'https://fileforge.in';

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
}

function upsertCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

const JSON_LD_ID = 'ff-structured-data';

function upsertJsonLd(data: unknown[]) {
  document.getElementById(JSON_LD_ID)?.remove();
  if (data.length === 0) return;

  const script = document.createElement('script');
  script.id = JSON_LD_ID;
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data.length === 1 ? data[0] : data);
  document.head.appendChild(script);
}

export interface PageMeta {
  title: string;
  description: string;
  /** Path only, e.g. "/merge-pdf". */
  path: string;
  jsonLd?: unknown[];
  noIndex?: boolean;
}

/**
 * Head data collected during a prerender pass. Effects do not run on the
 * server, so the hook records synchronously instead — this is how the build
 * knows what to write into each page's <head> (spec 14.3).
 */
export const collectedMeta: { current: PageMeta | null } = { current: null };

export function usePageMeta(meta: PageMeta) {
  const { title, description, path, jsonLd = [], noIndex } = meta;

  if (typeof document === 'undefined') collectedMeta.current = meta;

  useEffect(() => {
    const url = `${SITE_URL}${path}`;
    document.title = title;

    upsertMeta('meta[name="description"]', { name: 'description', content: description });
    upsertMeta('meta[name="robots"]', {
      name: 'robots',
      content: noIndex ? 'noindex,nofollow' : 'index,follow',
    });

    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: url });
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: SITE_NAME });
    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary' });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description });

    upsertCanonical(url);
    upsertJsonLd(jsonLd);
    // jsonLd is rebuilt on every render, so it is compared by content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, path, noIndex, JSON.stringify(jsonLd)]);
}

/** SoftwareApplication — what the tool is and that it costs nothing. */
export function softwareApplicationLd(tool: ToolDef) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: `${tool.name} — ${SITE_NAME}`,
    description: tool.seo.description,
    url: `${SITE_URL}${toolPath(tool)}`,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any browser',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
  };
}

/** FAQPage — the block that actually wins the long-tail queries. */
export function faqPageLd(tool: ToolDef) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: tool.seo.faq.map((entry) => ({
      '@type': 'Question',
      name: entry.q,
      acceptedAnswer: { '@type': 'Answer', text: entry.a },
    })),
  };
}

export function breadcrumbLd(trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: step.name,
      item: `${SITE_URL}${step.path}`,
    })),
  };
}

export function howToLd(tool: ToolDef, steps: string[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: tool.seo.h1,
    step: steps.map((text, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      text,
    })),
  };
}
