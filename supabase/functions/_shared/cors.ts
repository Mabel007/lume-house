const stagingUrl = 'https://gscihjjwhmvddrmcfpxp.supabase.co';
const productionUrl = 'https://wyvsbzcltrhnjeuijsva.supabase.co';
const productionStorefrontOrigin = 'https://lume.najbuilds.com';

function isExactOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && !url.hostname.includes('*') && url.origin === value;
  } catch {
    return false;
  }
}

/** Preserve legacy entries; allow the exact owned storefront only in production. */
export function allowedOrigins(original: string, extra: string | undefined, projectUrl: string | undefined): string[] {
  const origins = original.split(',').map(value => value.trim()).filter(Boolean);
  if (projectUrl === productionUrl) return [...new Set([...origins, productionStorefrontOrigin])];
  if (projectUrl !== stagingUrl) return origins;
  const supplemental = (extra ?? '').split(',').map(value => value.trim()).filter(isExactOrigin);
  return [...new Set([...origins, ...supplemental])];
}
