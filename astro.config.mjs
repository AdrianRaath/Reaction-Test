// @ts-check
import { defineConfig } from 'astro/config';

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
});
