import type { APIRoute } from 'astro';

const site = (import.meta.env.SITE ?? '').replace(/\/$/, '');

const body = `# OpenAX — https://${site || 'example.com'}

User-agent: *
Allow: /

# AI crawlers are welcome: this site is built for agents.
# (Allow: / above already covers these; listed explicitly so the intent is
# unambiguous to crawlers that special-case these tokens.)
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-User
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Perplexity-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: Bytespider
Allow: /

${site ? `Sitemap: ${site}/sitemap.xml\n` : ''}`;

export const GET: APIRoute = () =>
  new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
