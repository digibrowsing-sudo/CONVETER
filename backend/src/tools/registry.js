'use strict';

// Backend view of the tool registry (spec 5.1).
//
// shared/tools.json is the single source of truth. The API's allowed-operations
// list, the per-tool size and count caps, the accepted extensions and the tier
// routing all derive from it — there is no second list to keep in sync.

const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.resolve(__dirname, '..', '..', '..', 'shared', 'tools.json');

const TIERS = ['C', 'S1', 'S2', 'F'];
const CATEGORIES = ['organise', 'optimise', 'convert', 'edit', 'security', 'finance'];

function load(registryPath = REGISTRY_PATH) {
  const raw = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  validate(raw);
  return raw;
}

// Fail loudly at boot rather than at the first request. A registry typo that
// reaches production means a tool page 404s or, worse, a size cap goes missing.
function validate(registry) {
  if (!Array.isArray(registry.tools) || registry.tools.length === 0) {
    throw new Error('tool registry: "tools" must be a non-empty array');
  }
  const seen = new Set();
  for (const tool of registry.tools) {
    const where = `tool registry: "${tool.slug || '(no slug)'}"`;
    if (!tool.slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(tool.slug)) {
      throw new Error(`${where} slug must be lower-case kebab-case`);
    }
    if (seen.has(tool.slug)) throw new Error(`${where} duplicate slug`);
    seen.add(tool.slug);

    if (!TIERS.includes(tool.tier)) throw new Error(`${where} tier must be one of ${TIERS}`);
    if (!CATEGORIES.includes(tool.category)) {
      throw new Error(`${where} category must be one of ${CATEGORIES}`);
    }
    if (!Array.isArray(tool.acceptExts) || tool.acceptExts.length === 0) {
      throw new Error(`${where} acceptExts must be a non-empty array`);
    }
    if (!Number.isInteger(tool.maxFiles) || tool.maxFiles < 1) {
      throw new Error(`${where} maxFiles must be a positive integer`);
    }
    if (!Number.isInteger(tool.maxBytes) || tool.maxBytes < 1) {
      throw new Error(`${where} maxBytes must be a positive integer`);
    }
    const tierMax = registry.tiers?.[tool.tier]?.maxBytes;
    if (tierMax && tool.maxBytes > tierMax) {
      throw new Error(`${where} maxBytes ${tool.maxBytes} exceeds tier ${tool.tier} cap ${tierMax}`);
    }
    if (!tool.seo?.h1 || !tool.seo?.title || !tool.seo?.description) {
      throw new Error(`${where} seo.title, seo.description and seo.h1 are required`);
    }
    // Spec 18.1: every tool page ships at least six FAQ entries, which are also
    // what the FAQPage JSON-LD is generated from.
    if (!Array.isArray(tool.seo.faq) || tool.seo.faq.length < 6) {
      throw new Error(`${where} needs at least 6 seo.faq entries`);
    }
  }

  // Related-tool links drive the internal link web (spec 14.3); a dangling slug
  // silently produces a 404 in the footer of a page we are trying to rank.
  for (const tool of registry.tools) {
    for (const slug of tool.seo.related || []) {
      if (!seen.has(slug)) {
        throw new Error(`tool registry: "${tool.slug}" links to unknown related tool "${slug}"`);
      }
    }
  }
}

const registry = load();
const bySlug = new Map(registry.tools.map((tool) => [tool.slug, tool]));

/** Tools whose jobs run on the server — the only ones POST /v1/jobs will accept. */
const serverTools = registry.tools.filter((tool) => registry.tiers[tool.tier].serverSide);

/**
 * Tools that can be promoted to the server when the browser engine fails
 * (spec 9.4 progressive fallback), keyed by slug.
 */
const fallbackTools = registry.tools.filter((tool) => tool.fallbackTier);

function get(slug) {
  return bySlug.get(slug) || null;
}

/** The tier a job actually runs at: the fallback tier for promoted Tier C jobs. */
function effectiveTier(tool) {
  return tool.tier === 'C' ? tool.fallbackTier || null : tool.tier;
}

function isServerRunnable(tool) {
  return Boolean(tool && effectiveTier(tool));
}

module.exports = {
  registry,
  tiers: registry.tiers,
  tools: registry.tools,
  serverTools,
  fallbackTools,
  slugs: [...bySlug.keys()],
  get,
  effectiveTier,
  isServerRunnable,
  load,
  validate,
  REGISTRY_PATH,
};
