import { readdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { apexHost, hstsFor, isSharedHost } from '../src/integrations/origin.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const HTML_BUDGET = 9600;
const JS_BUDGET = 0;

const failures = [];
const warnings = [];
const passes = [];
const fail = (m) => failures.push(m);
const warn = (m) => warnings.push(m);
const ok = (m) => passes.push(m);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const files = await walk(DIST);
const rel = (p) => p.slice(DIST.length).replaceAll('\\', '/');
const read = (p) => readFile(p, 'utf8');

const htmlFiles = files.filter((f) => f.endsWith('.html'));
const indexPath = files.find((f) => rel(f) === 'index.html');

const html = indexPath ? await read(indexPath) : '';
const headers = files.some((f) => rel(f) === '_headers') ? await read(join(DIST, '_headers')) : '';

const sizes = new Map(await Promise.all(files.map(async (f) => [f, (await stat(f)).size])));
const sizeOf = (f) => sizes.get(f) ?? 0;

if (!indexPath) {
  fail('dist/index.html is missing — the build produced no home page.');
} else {
  for (const page of ['404.html', 'robots.txt', 'sitemap.xml', 'llms.txt', '_headers']) {
    if (!files.some((f) => rel(f) === page)) fail(`dist/${page} is missing.`);
  }
}

if (indexPath) {
  const size = sizeOf(indexPath);
  if (size > HTML_BUDGET) {
    fail(`dist/index.html is ${size} B, over the ${HTML_BUDGET} B budget (+${size - HTML_BUDGET}).`);
  } else {
    ok(`home document ${size} B / ${HTML_BUDGET} B`);
  }
}

const jsBytes = files.filter((f) => f.endsWith('.js')).reduce((n, f) => n + sizeOf(f), 0);
if (jsBytes > JS_BUDGET) fail(`${jsBytes} B of JavaScript shipped (budget ${JS_BUDGET} B).`);
else ok('zero JavaScript shipped');

const woffs = files.filter((f) => f.endsWith('.woff'));
if (woffs.length) {
  fail(`${woffs.length} legacy .woff file(s) in dist (${woffs.map(rel).join(', ')}). Every browser in use speaks woff2 — these are never downloaded.`);
}
const ttf = files.filter((f) => /\.(ttf|otf|eot)$/.test(f));
if (ttf.length) fail(`${ttf.length} .ttf/.otf/.eot file(s) in dist: ${ttf.map(rel).join(', ')}.`);

const manifest = files.some((f) => rel(f) === 'site.webmanifest') ? await read(join(DIST, 'site.webmanifest')) : '';
const allHtmlText = (await Promise.all(htmlFiles.map((f) => read(f)))).join('\n') + manifest;
const referenced = new Set([...allHtmlText.matchAll(/"?(?:\/)?([\w.-]+\.(?:png|webp|svg|jpg|jpeg|avif|ico|woff2?|txt|xml|webmanifest))"?/g)].map((m) => `/${m[1]}`));
const UNLINKED = new Set(['index.html', '404.html', '_headers', '_redirects']);
const orphans = files
  .map(rel)
  .filter((r) => {
    if (UNLINKED.has(r) || r.startsWith('.well-known/')) return false;
    if (r === 'site.webmanifest' || r === 'robots.txt' || r === 'llms.txt') return false;
    if (/^[0-9a-f]{8,128}\.txt$/.test(r)) return false;
    const name = r.slice(r.lastIndexOf('/') + 1);
    return !referenced.has(`/${name}`) && !referenced.has(r);
  });
if (orphans.length) warn(`unreferenced files in dist: ${orphans.join(', ')}`);

for (const f of files) {
  if (!/\.(html|xml|txt|json|webmanifest|md)$/.test(f)) continue;
  const text = await read(f);
  if (/YOUR_DOMAIN|TODO: set `site`|example\.com/.test(text) && !f.endsWith('robots.txt')) {
    fail(`${rel(f)} still contains a placeholder host.`);
  }
}

if (html) {
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  const ogUrl = html.match(/property="og:url" content="([^"]+)"/)?.[1];
  const ogImage = html.match(/property="og:image" content="([^"]+)"/)?.[1];
  const twImage = html.match(/name="twitter:image" content="([^"]+)"/)?.[1];

  const hint = 'Set SITE_URL to your https origin (see .env.example) and rebuild.';
  for (const [label, value] of [['og:image', ogImage], ['twitter:image', twImage], ['canonical', canonical], ['og:url', ogUrl]]) {
    if (!value) {
      warn(`${label} is absent. ${hint}`);
    } else if (!/^https:\/\//.test(value)) {
      fail(`${label} is relative or non-https ("${value}"), so every social share renders without a card. ${hint}`);
    }
  }

  const cid = (html.match(/data-astro-cid-/g) ?? []).length;
  if (cid) fail(`${cid} data-astro-cid attributes in index.html — styles are scoped again; move them into src/styles/global.css.`);
  else ok('no scoped-style attributes');

  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].filter((m) => !/type="application\/ld\+json"/.test(m[1]));
  if (scripts.length) fail(`${scripts.length} executable <script> tag(s) in index.html.`);

  for (const tag of html.match(/<link[^>]*rel="preload"[^>]*as="image"[^>]*>/g) ?? []) {
    if (!/imagesrcset=/.test(tag)) fail(`image preload without imagesrcset will be re-fetched on high-DPR displays: ${tag}`);
  }

  if (!/rel="sitemap"/.test(html)) warn('no <link rel="sitemap"> in the head.');
  if (!/rel="manifest"/.test(html)) warn('no <link rel="manifest"> in the head.');
  if (!/<meta name="viewport"/.test(html)) fail('missing viewport meta.');

  for (const [, href] of html.matchAll(/<link[^>]*rel="preload"[^>]*href="([^"]+)"/g)) {
    const r = href.split('?')[0].replace(/^\//, '');
    if (r.startsWith('_astro/') && !files.some((f) => rel(f).endsWith(r.slice(r.lastIndexOf('/') + 1)))) {
      fail(`preload points at ${href}, which is not in dist.`);
    }
  }
}

if (headers) {
  const csp = headers.match(/Content-Security-Policy:\s*(.+)/)?.[1] ?? '';
  if (!csp) fail('no Content-Security-Policy in dist/_headers.');
  else {
    if (/script-src[^;]*'unsafe-inline'/.test(csp)) {
      fail("script-src allows 'unsafe-inline'. Run the build so the JSON-LD hash is injected.");
    }
    if (/style-src[^;]*'unsafe-inline'/.test(csp)) {
      fail("style-src allows 'unsafe-inline'. Astro inlines CSS, so this should be a hash.");
    }
    if (/__CSP_[A-Z_]+__/.test(csp)) fail('CSP still contains an unreplaced build placeholder.');

    const hashes = new Set();
    for (const f of htmlFiles) {
      const doc = await read(f);
      for (const [, body] of doc.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi)) {
        hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
      }
      for (const [, body] of doc.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
        hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
      }
    }
    const advertised = new Set(csp.match(/'sha256-[A-Za-z0-9+/=]+'/g) ?? []);
    if (advertised.size === 0 && hashes.size > 0) {
      fail('CSP advertises no quoted hashes; an unquoted hash-source makes browsers discard the whole directive and drop all styling.');
    }
    for (const h of hashes) {
      if (!advertised.has(h)) fail(`CSP is missing the hash for an inline block present in the HTML (${h.slice(0, 16)}…).`);
    }
    for (const h of advertised) {
      if (!hashes.has(h)) warn(`CSP advertises a hash that matches nothing in the built HTML: ${h.slice(0, 16)}…`);
    }
    if (hashes.size) ok(`${hashes.size} CSP hash(es) verified against the shipped HTML`);

    for (const directive of ['default-src', 'object-src', 'frame-ancestors', 'base-uri', 'upgrade-insecure-requests']) {
      if (!new RegExp(`(?:^|; )${directive}`).test(csp)) fail(`CSP is missing ${directive}.`);
    }
  }

  if (!/^ {2}Link: <\//m.test(headers)) {
    warn('no Link: rel=preload header on the HTML routes — Cloudflare Early Hints cannot fire.');
  }
  if (!/Strict-Transport-Security/.test(headers)) fail('no HSTS header.');

  const site = (process.env.SITE_URL ?? '').trim();
  const host = apexHost(site);
  if (host) {
    const hsts = headers.match(/Strict-Transport-Security:\s*(.+)/)?.[1]?.trim();
    const expected = hstsFor(host);
    if (hsts !== expected) {
      fail(`HSTS is "${hsts}" but ${host} requires "${expected}" (see src/integrations/origin.mjs).`);
    } else {
      ok(`HSTS scoped to ${host}${isSharedHost(host) ? ' (shared apex: no preload)' : ''}`);
    }
  }
}

if (headers) {
  const blockFor = (route) =>
    headers
      .split(/\n(?=\S)/)
      .find((b) => b.startsWith(route))
      ?.split('\n')
      .join(' ') ?? '';

  const astar = blockFor('/_astro/*');
  if (!/immutable/.test(astar)) fail('/_astro/* is not immutable — fingerprinted assets must cache forever.');
  if (!/max-age=31536000/.test(astar)) fail('/_astro/* lacks a 1-year max-age.');

  const root = `${blockFor('/')} ${blockFor('/index.html')}`;
  if (!/CDN-Cache-Control:[^|]*max-age=\d+/.test(root)) fail('HTML has no edge Cache-Control — a traffic spike would hit origin.');

  const site = (process.env.SITE_URL ?? '').trim();
  const redirects = files.some((f) => rel(f) === '_redirects') ? await read(join(DIST, '_redirects')) : '';
  const host = apexHost(site);
  if (host) {
    if (isSharedHost(host)) {
      if (redirects.trim()) {
        fail(`dist/_redirects exists but ${host} is a shared apex, where a www redirect cannot exist.`);
      } else {
        ok(`no www redirect emitted for shared apex ${host}`);
      }
    } else if (!redirects.includes(`https://${host}/$1 301`)) {
      fail(`dist/_redirects does not 301 www -> ${host}.`);
    } else {
      ok(`www -> ${host} 301 present`);
    }
  }
}

if (files.some((f) => rel(f) === 'robots.txt') && files.some((f) => rel(f) === 'sitemap.xml')) {
  const site = (process.env.SITE_URL ?? '').replace(/\/$/, '');
  const robotsTxt = await read(join(DIST, 'robots.txt'));
  const sitemapXml = await read(join(DIST, 'sitemap.xml'));
  if (site) {
    if (!robotsTxt.includes(`Sitemap: ${site}/sitemap.xml`)) fail('robots.txt has no Sitemap: line for the configured site.');
    if (!sitemapXml.includes(`<loc>${site}/</loc>`)) fail('sitemap.xml does not list the configured site origin.');
  }
  if (/<loc>https?:\/\/[^/]*<\/loc>/.test(sitemapXml) && /YOUR_DOMAIN|example\.com/.test(sitemapXml)) {
    fail('sitemap.xml contains a placeholder host.');
  }
  for (const tag of ['urlset', 'url', 'loc', 'lastmod']) {
    if (!new RegExp(`<${tag}[\\s>]`).test(sitemapXml)) fail(`sitemap.xml is missing a <${tag}> element.`);
  }
  if (!/^<\?xml version="1\.0" encoding="UTF-8"\?>/.test(sitemapXml)) fail('sitemap.xml is missing its XML declaration.');
}

const total = files.reduce((n, f) => n + sizeOf(f), 0);
const lines = [];
for (const f of [...files].sort((a, b) => rel(a).localeCompare(rel(b)))) {
  lines.push(`${rel(f).padEnd(48)} ${String(sizeOf(f)).padStart(7)} B`);
}

console.log(lines.join('\n'));
console.log(`\n${files.length} files, ${total.toLocaleString()} B total before compression.`);
const firstLoad = [indexPath, ...files.filter((f) => rel(f).startsWith('_astro/') || /logo-.*\.webp$/.test(rel(f)))]
  .filter(Boolean)
  .reduce((n, f) => n + sizeOf(f), 0);
console.log(`Critical path (document + font + logo): ${firstLoad.toLocaleString()} B uncompressed.\n`);
for (const p of passes) console.log(`  pass  ${p}`);
for (const w of warnings) console.warn(`  warn  ${w}`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  console.error(`\n${failures.length} check(s) failed.\n`);
  process.exit(1);
}
console.log('All checks passed.\n');
