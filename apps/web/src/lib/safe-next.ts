/** Only same-site paths, never `//evil.com` or absolute URLs. */
export function safeNext(value: unknown, fallback = '/explore'): string {
  const next = typeof value === 'string' ? value : '';
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
    ? next
    : fallback;
}
