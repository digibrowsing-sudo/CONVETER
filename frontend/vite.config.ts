import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const SITE_URL = 'https://fileforge.in';

const registryPath = fileURLToPath(new URL('../shared/tools.json', import.meta.url));

interface RegistryTool {
  slug: string;
  tier: string;
}

/**
 * Generate sitemap.xml and robots.txt from the tool registry at build time
 * (spec 14.3). Deriving them means a tool added to shared/tools.json is
 * submitted to Search Console automatically, rather than being forgotten in a
 * file nobody remembers to edit.
 */
function seoFiles(enabled: boolean): Plugin {
  return {
    name: 'fileforge-seo-files',
    apply: 'build',
    generateBundle() {
      // Skipped for the SSR pass, which emits to dist-ssr and is never served.
      if (!enabled) return;
      const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as { tools: RegistryTool[] };

      const toolPaths = registry.tools.map((tool) =>
        tool.tier === 'F' ? `/finance/${tool.slug}` : `/${tool.slug}`,
      );

      // Tool pages carry the highest priority: they are the SEO surface, and
      // the legal pages exist to be found by people who go looking for them.
      const entries = [
        { path: '/', priority: '1.0' },
        { path: '/finance', priority: '0.9' },
        ...toolPaths.map((path) => ({ path, priority: '0.8' })),
        ...['/privacy', '/terms', '/security', '/refund', '/contact', '/dmca'].map((path) => ({
          path,
          priority: '0.3',
        })),
      ];

      const today = new Date().toISOString().slice(0, 10);
      const sitemap = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...entries.map(
          (entry) =>
            `  <url><loc>${SITE_URL}${entry.path}</loc>` +
            `<lastmod>${today}</lastmod>` +
            `<priority>${entry.priority}</priority></url>`,
        ),
        '</urlset>',
        '',
      ].join('\n');

      const robots = [
        'User-agent: *',
        'Allow: /',
        '',
        '# The API is not content. Crawling it would queue conversion jobs.',
        'Disallow: /api/',
        '',
        `Sitemap: ${SITE_URL}/sitemap.xml`,
        '',
      ].join('\n');

      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
    },
  };
}

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), seoFiles(!isSsrBuild)],
  server: {
    // shared/tools.json lives outside the frontend root but is imported by it.
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: 'http://localhost:8095',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Keeps the initial tool-page bundle inside the 180 KB budget (spec 9.5):
    // pdf-lib and pdf.js are only fetched once a file is actually dropped.
    // The SSR bundle keeps React external, so it must not be chunked.
    rollupOptions: isSsrBuild
      ? {}
      : {
          output: {
            manualChunks: {
              react: ['react', 'react-dom', 'react-router-dom'],
            },
          },
        },
  },
}));
