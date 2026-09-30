# OpenAX Website

Landing page for the [OpenAX](https://github.com/open-ax) organisation. Fully static, zero JavaScript.

> The web was built for human eyes. We're building it for agents.

## Running it

```sh
cp .env.example .env      # set SITE_URL to your production origin
npm install
npm run dev               # http://localhost:4321
npm run build             # builds into dist/, then runs the verifier
npm run deploy            # build + verify + wrangler deploy
```

## Structure

- `src/pages/` — routes: `index.astro`, `404.astro`, plus generated `robots.txt` / `sitemap.xml`
- `src/layouts/` — shared head, meta and SEO tags (`Layout.astro`)
- `src/styles/` — the single inlined stylesheet (`global.css`)
- `src/integrations/` — `edge-headers.mjs`, the post-build CSP + Early Hints pass
- `scripts/verify.mjs` — the build gate
- `public/` — static assets, `_headers`, `llms.txt`, `site.webmanifest`
- `wrangler.jsonc` — Cloudflare config plus the dashboard settings checklist

## How it stays fast

Every claim below is enforced by `scripts/verify.mjs`, which runs on every build
and fails it rather than letting a regression reach production.

| Decision | Why |
| --- | --- |
| Static assets, no Worker script | A request never enters the isolates runtime, so there is no extra TTFB hop. |
| CSS inlined into the document | Zero render-blocking subresources. |
| One variable woff2 (34 KB) | Replaces three static weights (41 KB). One request, one buffer, every weight served from it. |
| Astro generates a metric-matched fallback | The fallback→webfont swap is pixel-identical, so CLS is structurally 0. |
| Global CSS, not Astro scoped styles | Scoping adds a `data-astro-cid-*` attribute to ~47 elements and repeats it in every selector. |
| LCP image preloaded with `imagesrcset` + `imagesizes` | Without them, high-DPR displays download the 1x file *and* the 2x file they actually render. |
| `Link: rel=preload` on the HTML routes | Cloudflare Early Hints replays it on a cache miss, starting the font and logo ~1 RTT early. It is derived from the real markup, so it cannot drift. |
| CSP with hashed inline blocks | `astro:build:done` hashes the emitted `<style>` and JSON-LD and splices the digests into `dist/_headers`, so no `'unsafe-inline'` is needed. |
| One `SITE_URL` source of truth | Feeds canonical, `og:url`, `og:image`, JSON-LD, sitemap, robots and the www→apex 301, so none of them can disagree. |
| `/robots.txt` and `/sitemap.xml` as routes | A hand-maintained copy shipped a commented-out `YOUR_DOMAIN` line. Generating them removes the class of bug. |
| Immutable caching on `/_astro/*`, `stale-while-revalidate` on HTML | Fingerprinted assets cache for a year; HTML revalidates at the edge for 5 minutes, so a traffic spike never becomes an origin spike. |

## Deploying

Cloudflare Workers Static Assets, no adapter. The dashboard checklist lives in
`wrangler.jsonc` — SSL mode, HTTP/3, Early Hints, Brotli and Tiered Cache all
have to be enabled once in the Cloudflare UI.

Keep **Rocket Loader off**: there is nothing to lazy-load, and it can reorder the
document against the preloads.

Part of [open-ax](https://github.com/open-ax).
