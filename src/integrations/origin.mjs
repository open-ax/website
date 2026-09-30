const SHARED_SUFFIXES = ['.workers.dev', '.pages.dev'];

export function apexHost(site = '') {
  if (!site.trim()) return '';
  try {
    return new URL(site).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

export function isSharedHost(host = '') {
  const h = host.toLowerCase();
  return SHARED_SUFFIXES.some((suffix) => h.endsWith(suffix));
}

export function hstsFor(host) {
  return isSharedHost(host)
    ? 'max-age=63072000'
    : 'max-age=63072000; includeSubDomains; preload';
}
