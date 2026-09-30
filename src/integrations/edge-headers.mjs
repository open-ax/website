import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { apexHost, hstsFor, isSharedHost } from './origin.mjs';

const HEADERS_FILE = '_headers';
const REDIRECTS_FILE = '_redirects';

const PRELOAD_ATTRS = ['as', 'type', 'crossorigin', 'imagesrcset', 'imagesizes'];

// Quotes are mandatory: CSP's hash-source is `'sha256-' base64-value`. Unquoted,
// the token parses as a host-source, the directive is dropped, and styling dies.
const sha256 = (value) => `'sha256-${createHash('sha256').update(value, 'utf8').digest('base64')}'`;

function inlineBlocks(html, tag) {
  const out = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  for (const match of html.matchAll(re)) out.push(match[1]);
  return out;
}

function toLinkHeaderValue(tag) {
  const parts = [];
  for (const attr of PRELOAD_ATTRS) {
    const valued = tag.match(new RegExp(`\\s${attr}="([^"]*)"`, 'i'));
    if (valued) {
      parts.push(`${attr}=${JSON.stringify(valued[1])}`);
    } else if (new RegExp(`\\s${attr}(?=[\\s>/])`, 'i').test(tag)) {
      parts.push(attr);
    }
  }
  return `<${tag.match(/\shref="([^"]*)"/i)?.[1]}>; rel=preload; ${parts.join('; ')}`;
}

function resolveDocument(outDir, pathname) {
  const bare = pathname.replace(/^\/|\/$/g, '');
  const candidates = bare === '' ? ['index.html'] : [...new Set([`${bare}.html`, `${bare}/index.html`, bare])];

  for (const candidate of candidates) {
    if (existsSync(join(outDir, candidate))) return candidate;
  }
  return null;
}

export function edgeHeaders({ site = '' } = {}) {
  return {
    name: 'openax:edge-headers',
    hooks: {
      'astro:build:done': async ({ dir, pages, logger }) => {
        const outDir = fileURLToPath(dir);

        const documents = new Map();
        for (const { pathname } of pages) {
          const file = resolveDocument(outDir, pathname);
          if (!file) continue;
          try {
            documents.set(file, await readFile(join(outDir, file), 'utf8'));
          } catch {
            continue;
          }
        }

        const allHtml = [...documents.values()].join('\n');
        const scriptHashes = [...new Set(inlineBlocks(allHtml, 'script').map(sha256))];
        const styleHashes = [...new Set(inlineBlocks(allHtml, 'style').map(sha256))];

        let headers;
        try {
          headers = await readFile(join(outDir, HEADERS_FILE), 'utf8');
        } catch {
          logger.warn(`edge-headers: dist/${HEADERS_FILE} missing — CSP hashes not applied.`);
          return;
        }

        headers = headers
          .replaceAll('__CSP_SCRIPT_HASH__', scriptHashes.join(' '))
          .replaceAll('__CSP_STYLE_HASH__', styleHashes.join(' '))
          .replaceAll('__HSTS__', hstsFor(apexHost(site)));

        for (const [file, html] of documents) {
          const links = [...html.matchAll(/<link\s[^>]*rel="preload"[^>]*>/gi)]
            .map((m) => toLinkHeaderValue(m[0]))
            .filter((v) => v.includes('>'));
          if (!links.length) continue;

          const routes = file === 'index.html' ? ['/', '/index.html'] : [`/${file}`];

          for (const route of routes) {
            const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const block = new RegExp(`^${escaped}\\r?\\n(?:[ \\t].*\\r?\\n)*`, 'm');
            if (!block.test(headers)) {
              logger.warn(`edge-headers: no header block for ${route} — Early Hints not applied.`);
              continue;
            }
            headers = headers.replace(block, (m) => `${m}  Link: ${links.join(', ')}\n`);
          }
        }

        await writeFile(join(outDir, HEADERS_FILE), headers, 'utf8');

        const host = apexHost(site);

        if (!host) {
          logger.warn(
            'edge-headers: SITE_URL is not set — canonical/og:url/og:image, /sitemap.xml, ' +
              '/robots.txt and HSTS scoping are all missing. Set SITE_URL in .env.',
          );
          return;
        }

        if (isSharedHost(host)) {
          logger.info(
            `edge-headers: CSP hashes + Early Hints applied; HSTS scoped to ${host} ` +
              '(no includeSubDomains/preload on a shared apex, no www redirect).',
          );
          return;
        }

        const lines = [`https://www.${host}/* https://${host}/$1 301`, ''];
        await writeFile(join(outDir, REDIRECTS_FILE), lines.join('\n'), 'utf8');
        logger.info(`edge-headers: CSP hashes + Early Hints applied; ${host} canonicalised.`);
      },
    },
  };
}
