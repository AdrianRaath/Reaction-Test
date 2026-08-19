// @ts-check
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import mdx from '@astrojs/mdx';
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';

/**
 * sitemap.xml, generated from the built routes (REVAMP.md phase 6).
 *
 * Not @astrojs/sitemap: that emits sitemap-index.xml, but the IndexNow
 * workflow reads public/sitemap.xml and must keep working unchanged (§8).
 * This writes the same file to dist/ (served) AND public/ (committed, read by
 * scripts/submit-indexnow.mjs) — so the checked-in copy can never drift from
 * the routes: every build rewrites it.
 *
 * Priorities reproduce the live sitemap's scheme: home 1.0, tools 0.9,
 * guides index 0.8, guide articles 0.7, about 0.5, privacy 0.3.
 */
function sitemap() {
  return {
    name: 'reflexlab-sitemap',
    hooks: {
      /** @param {{ pages: { pathname: string }[], dir: URL, logger: any }} args */
      'astro:build:done': ({ pages, dir, logger }) => {
        const priorityFor = (/** @type {string} */ path) => {
          if (path === '/') return '1.0';
          if (path === '/guides') return '0.8';
          if (path.startsWith('/guides/')) return '0.7';
          if (path === '/about') return '0.5';
          if (path === '/privacy') return '0.3';
          return '0.9'; // depth-1 tool pages
        };

        const paths = pages
          // Normalise to the live URL forms: no trailing slash, no .html.
          .map((p) => '/' + p.pathname.replace(/\.html$/, '').replace(/\/+$/, ''))
          .map((p) => (p === '/index' ? '/' : p))
          .filter((p) => p !== '/404')
          .sort((a, b) => Number(priorityFor(b)) - Number(priorityFor(a)));

        const xml =
          '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          paths
            .map(
              (p) =>
                `  <url>\n    <loc>https://reflexlab.co${p === '/' ? '/' : p}</loc>\n    <priority>${priorityFor(p)}</priority>\n  </url>`
            )
            .join('\n') +
          '\n</urlset>\n';

        writeFileSync(new URL('./sitemap.xml', dir), xml);
        writeFileSync(fileURLToPath(new URL('./public/sitemap.xml', import.meta.url)), xml);
        logger.info(`sitemap.xml generated (${paths.length} URLs) → dist + public`);
      },
    },
  };
}

// URL shape is a contract — see REVAMP.md §7 (Cutover: preserving SEO).
//
// Production serves leaf pages without a trailing slash (/about, /cps), which
// Vercel's `cleanUrls` produces from about.html. Astro's default
// `build.format: 'directory'` would emit /about/ instead and silently change
// six live URLs, so it is pinned to 'file' here. Do not change either this or
// `cleanUrls` in vercel.json without re-running the URL diff.
export default defineConfig({
  site: 'https://reflexlab.co',
  trailingSlash: 'never',
  build: {
    format: 'file',
  },
  integrations: [
    // Phosphor icons inlined as SVG at build time, replacing the unpinned
    // unpkg <script> the legacy pages load (REVAMP.md §6.2).
    icon({ include: { ph: ['*'] } }),
    // Content collections (guides, per-tool copy) are authored as MDX (§5).
    mdx(),
    sitemap(),
  ],
});
