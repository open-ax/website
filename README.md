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
