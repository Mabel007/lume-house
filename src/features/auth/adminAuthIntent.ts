const key = 'lume-house-admin-return';
const origin = 'https://lume-house.invalid';

export function adminReturnPath(value: string | null | undefined): string | null {
  if (!value?.startsWith('/') || value.startsWith('//')) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || !/^\/admin(?:\/|$)/.test(url.pathname)) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}
export function setAdminAuthIntent(storage: Pick<Storage, 'setItem' | 'removeItem'>, value?: string) {
  storage.removeItem(key);
  if (value !== undefined) {
    const path = adminReturnPath(value);
    if (!path) throw new Error('Invalid administration return path.');
    storage.setItem(key, path);
  }
}
export function consumeAdminAuthIntent(storage: Pick<Storage, 'getItem' | 'removeItem'>): string | null {
  const value = storage.getItem(key);
  storage.removeItem(key);
  return adminReturnPath(value);
}
