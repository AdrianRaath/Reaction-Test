// Submits every URL in sitemap.xml to IndexNow (api.indexnow.org), which
// propagates to all participating engines (Bing, Yandex, Seznam, Naver, Yep).
//
// Usage:
//   node scripts/submit-indexnow.mjs            submit all sitemap URLs
//   node scripts/submit-indexnow.mjs --dry-run  list the URLs without submitting
//
// The key is not a secret: engines verify it against the public key file
// hosted at https://reflexlab.co/<key>.txt.
import { readFile } from 'node:fs/promises';

const HOST = 'reflexlab.co';
const KEY = '145db6405d4006d1f6914fd03af99c1c';

const sitemap = await readFile(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

if (urls.length === 0) {
  console.error('No URLs found in sitemap.xml');
  process.exit(1);
}

if (process.argv.includes('--dry-run')) {
  console.log(`Would submit ${urls.length} URLs for ${HOST}:`);
  for (const url of urls) console.log(`  ${url}`);
  process.exit(0);
}

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: `https://${HOST}/${KEY}.txt`,
    urlList: urls,
  }),
});

console.log(`Submitted ${urls.length} URLs to IndexNow: HTTP ${res.status}`);
if (res.status !== 200 && res.status !== 202) {
  console.error(await res.text());
  process.exit(1);
}
