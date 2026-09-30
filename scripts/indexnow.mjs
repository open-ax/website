import { readdirSync } from 'node:fs';

const site = (process.env.SITE_URL ?? '').trim();
if (!site) {
  console.log('indexnow: SITE_URL unset, skipping.');
  process.exit(0);
}

const { host } = new URL(site);
const key = readdirSync(new URL('../public/', import.meta.url))
  .map((f) => f.match(/^([0-9a-f]{8,128})\.txt$/)?.[1])
  .find(Boolean);

if (!key) {
  console.log('indexnow: no key file in public/, skipping.');
  process.exit(0);
}

const payload = JSON.stringify({ host, key, urlList: [`${site}/`] });

for (const endpoint of ['https://api.indexnow.org/indexnow', 'https://www.bing.com/indexnow']) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: payload,
  }).catch((e) => ({ ok: false, statusText: e.message }));

  console.log(`indexnow ${new URL(endpoint).host}: ${res.status} ${res.statusText ?? ''}`.trim());
}
