const stagingUrl = 'https://gscihjjwhmvddrmcfpxp.supabase.co';

function isExactOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && !url.hostname.includes('*') && url.origin === value;
  } catch {
    return false;
  }
}

/** Preserve legacy entries; supplemental origins apply only to this staging project. */
export function allowedOrigins(original: string, extra: string | undefined, projectUrl: string | undefined): string[] {
  const origins = original.split(',').map(value => value.trim()).filter(Boolean);
  if (projectUrl !== stagingUrl) return origins;
  const supplemental = (extra ?? '').split(',').map(value => value.trim()).filter(isExactOrigin);
  return [...new Set([...origins, ...supplemental])];
}
