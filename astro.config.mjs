import { defineConfig, fontProviders } from 'astro/config';
import { loadEnv } from 'vite';
import { edgeHeaders } from './src/integrations/edge-headers.mjs';

// loadEnv, not process.env: astro.config.mjs is evaluated before Vite populates
// the environment, so a .env file alone would otherwise be ignored.
const site = (loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '') || process.env).SITE_URL?.trim() ?? '';

export default defineConfig({
  ...(site ? { site } : {}),
  output: 'static',
  trailingSlash: 'never',
  compressHTML: true,
  prefetch: false,

  build: {
    format: 'file',
    inlineStylesheets: 'always',
    assets: '_astro',
  },

  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Hanken Grotesk',
      cssVariable: '--font-sans',
      options: {
        variants: [
          {
            src: ['@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2'],
            weight: '100 900',
            style: 'normal',
          },
        ],
      },
      weights: ['100 900'],
      styles: ['normal'],
      subsets: ['latin'],
      formats: ['woff2'],
      optimizedFallbacks: true,
      fallbacks: ['Arial', 'Helvetica', 'sans-serif'],
    },
  ],

  vite: {
    build: {
      minify: 'esbuild',
      cssMinify: true,
      assetsInlineLimit: 4096,
      target: 'esnext',
      sourcemap: false,
      chunkSizeWarningLimit: 500,
    },
  },

  integrations: [edgeHeaders({ site })],
});
