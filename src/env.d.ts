/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Absolute https origin of the deployed site. See `.env.example`. */
  readonly SITE?: string;
  /** Google Search Console HTML-tag verification token. Omitted when unset. */
  readonly GOOGLE_SITE_VERIFICATION?: string;
  /** Bing Webmaster Tools verification token. Omitted when unset. */
  readonly BING_SITE_VERIFICATION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
