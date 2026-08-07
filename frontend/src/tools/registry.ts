// Typed view of shared/tools.json — the same file the API reads (spec 5.1).
//
// Routes, the homepage grid, the footer link web, the sitemap and every page's
// SEO metadata are generated from this. Adding a tool means adding one object
// to the JSON; nothing here needs to change.

import registryData from '../../../shared/tools.json';

export type Tier = 'C' | 'S1' | 'S2' | 'F';

export type Category = 'organise' | 'optimise' | 'convert' | 'edit' | 'security' | 'finance';

export interface FaqEntry {
  q: string;
  a: string;
}

export interface ToolSeo {
  title: string;
  description: string;
  h1: string;
  faq: FaqEntry[];
  related: string[];
}

export interface ToolDef {
  slug: string;
  name: string;
  tier: Tier;
  category: Category;
  engine: string;
  accepts: string[];
  acceptExts: string[];
  produces: string;
  maxFiles: number;
  maxBytes: number;
  requiresPlan: 'free' | 'pro';
  requiresConsent?: boolean;
  disclaimer?: string;
  docType?: string;
  /** Tier C tools that can be promoted to the server when the browser cannot cope (spec 9.4). */
  fallbackTier?: Tier;
  seo: ToolSeo;
}

interface TierInfo {
  label: string;
  maxBytes: number;
  serverSide: boolean;
}

export const TIERS = registryData.tiers as Record<Tier, TierInfo>;
export const TOOLS = registryData.tools as ToolDef[];

const BY_SLUG = new Map(TOOLS.map((tool) => [tool.slug, tool]));

export function getTool(slug: string | undefined): ToolDef | undefined {
  return slug ? BY_SLUG.get(slug) : undefined;
}

/** True when the tool's work happens on the user's own device. */
export function runsInBrowser(tool: ToolDef): boolean {
  return tool.tier === 'C';
}

export function isFinance(tool: ToolDef): boolean {
  return tool.tier === 'F';
}

/** URL path for a tool. Finance tools live under /finance to group the vertical. */
export function toolPath(tool: ToolDef): string {
  return isFinance(tool) ? `/finance/${tool.slug}` : `/${tool.slug}`;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  organise: 'Organise PDFs',
  optimise: 'Optimise',
  convert: 'Convert',
  edit: 'Edit',
  security: 'Security',
  finance: 'Finance documents',
};

/** Homepage grid order: the browser-side tools lead, because they are the differentiator. */
export const CATEGORY_ORDER: Category[] = [
  'organise',
  'convert',
  'optimise',
  'edit',
  'security',
  'finance',
];

export function toolsByCategory(): { category: Category; tools: ToolDef[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    tools: TOOLS.filter((tool) => tool.category === category),
  })).filter((group) => group.tools.length > 0);
}

export const FINANCE_TOOLS = TOOLS.filter(isFinance);
export const GENERAL_TOOLS = TOOLS.filter((tool) => !isFinance(tool));

export function relatedTools(tool: ToolDef): ToolDef[] {
  return tool.seo.related.map(getTool).filter((entry): entry is ToolDef => Boolean(entry));
}

export function acceptAttribute(tool: ToolDef): string {
  return tool.acceptExts.join(',');
}

export function maxMegabytes(tool: ToolDef): number {
  return Math.floor(tool.maxBytes / (1024 * 1024));
}
