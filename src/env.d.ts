/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Absolute https origin of the deployed site. See `.env.example`. */
  readonly SITE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
