import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { adminReadFailure, adminRpc } from './adminRepository';
import { lastPage, parseAdminPage, type AdminPage, type PageSize } from './adminPagination';

export function useAdminPage<T>(token: string, rpc: string, filters: Record<string, string>, parse: (value: unknown) => T, key: (row: T) => string) {
 const filterKey = JSON.stringify(filters);
 const [request, setRequest] = useState({ scope: `${token}:${filterKey}`, page: 0, size: 10 as PageSize });
 const scope = `${token}:${filterKey}`;
 if (request.scope !== scope) setRequest({ scope, page: 0, size: request.size });
 const page = request.scope === scope ? request.page : 0;
 const size = request.size;
 const [revision, setRevision] = useState(0);
 const identity = JSON.stringify([scope, page, size, revision]);
 const [state, setState] = useState<{ identity: string; data?: AdminPage<T>; error?: string }>({ identity: '' });
 useEffect(() => {
  let active = true;
  const args = { ...JSON.parse(filterKey), p_page: page, p_page_size: size };
  void adminRpc(getSupabaseClient(), token, rpc, args).then(value => {
   const data = parseAdminPage(value, parse, key, page, size);
   if (!active) return;
   if (page > lastPage(data.total_count, size)) { setRequest({ scope, page: lastPage(data.total_count, size), size }); return; }
   setState({ identity, data });
  }).catch(cause => { if (active) setState({ identity, error: adminReadFailure(cause, 'Records') }); });
  return () => { active = false; };
 }, [token, rpc, filterKey, page, size, scope, identity, parse, key]);
 const current = state.identity === identity ? state : undefined;
 return { page, size, rows: current?.data?.items ?? [], total: current?.data?.total_count ?? 0, loading: !current, error: current?.error ?? '',
  changePage: (next: number) => setRequest({ scope, page: next, size }),
  changeSize: (next: PageSize) => setRequest({ scope, page: 0, size: next }),
  refresh: () => setRevision(value => value + 1) };
}
