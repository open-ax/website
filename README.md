# OpenAX Website

Landing page for the [OpenAX](https://github.com/open-ax) organisation. Fully static, zero JavaScript.

> The web was built for human eyes. We're building it for agents.

## Running it

```sh
cp .env.example .env      # set SITE_URL to your production origin
npm install
npm run dev               # http://localhost:4321
npm run build             # builds into dist/, then runs the verifier
npm run deploy            # build + verify + wrangler pages deploy
```

## Deploying

The site is hosted on **Cloudflare Pages** at <https://openax.pages.dev>, on the free plan.

First deploy:

```sh
npx wrangler login
npx wrangler pages project create   # name: openax
npm run deploy
```

After that, pushes to `main` deploy through `.github/workflows/deploy.yml`. Set these once:

| Where | Name | Value |
| --- | --- | --- |
| Repo variable | `SITE_URL` | `https://openax.pages.dev` |
| Repo secret | `CLOUDFLARE_API_TOKEN` | Workers › Edit API Token |
| Repo secret | `CLOUDFLARE_ACCOUNT_ID` | Workers › Account ID |

The API token needs **Workers Scripts: Edit** and **Account Settings: Read**.

### Moving to openax.ai

`openax.ai` is registered but parked. To use it: add the domain as a Cloudflare zone, point its
nameservers at Cloudflare, attach `openax.ai` and `www.openax.ai` as custom domains, then set
`SITE_URL=https://openax.ai` in `.env` and in the repo variable. Nothing else changes — the
www→apex 301, HSTS preload and canonical host all follow from that one value
(see `src/integrations/origin.mjs`).

## Structure

- `src/pages/` — routes: `index.astro`, `404.astro`, plus generated `robots.txt` / `sitemap.xml`
- `src/layouts/` — shared head, meta and SEO tags (`Layout.astro`)
- `src/styles/` — the single inlined stylesheet (`global.css`)
- `src/integrations/` — `edge-headers.mjs`, the post-build CSP + Early Hints pass, and
  `origin.mjs`, which decides host-dependent behaviour
- `scripts/verify.mjs` — the build gate
- `scripts/indexnow.mjs` — tells Bing the site changed after a deploy
- `public/` — static assets, `_headers`, `llms.txt`, `site.webmanifest`
- `wrangler.jsonc` — Cloudflare Pages config

## Verifying a deploy

```sh
curl -sI https://openax.pages.dev | grep -Ei 'strict-transport|link|cache-control'
```

Expect `max-age=63072000` on HSTS, a `Link:` preload header, and `noindex` on `/404`.
