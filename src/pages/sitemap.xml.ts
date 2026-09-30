import type { APIRoute } from 'astro';

const site = (import.meta.env.SITE ?? '').replace(/\/$/, '');

// Fixed on purpose: a two-page marketing site whose URL set does not change
// between deploys. A per-build date would report a false "last modified".
const LASTMOD = '2026-09-30';

const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${site}/</loc>
    <lastmod>${LASTMOD}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;

export const GET: APIRoute = () =>
  new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
