import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { adminRpc, checkAdmin } from './adminRepository';
import { exportCsv, type ExportKind } from './adminCsv';

function downloadCsv(csv: string, kind: ExportKind): void {
 const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
 const link = document.createElement('a');
 link.href = url; link.download = `lume-house-${kind}.csv`;
 document.body.append(link);
 try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
export function AdminCsvExport({ token, kind, query, status = '', policy = '', disabled = false }: { token: string; kind: ExportKind; query: string; status?: string; policy?: string; disabled?: boolean }) {
 const generation = useRef(0);
 const running = useRef(false);
 const scope = JSON.stringify([token, kind, query, status, policy, disabled]);
 const latest = useRef(scope);
 const [state, setState] = useState<{ scope: string; busy: boolean; message: string }>({ scope, busy: false, message: '' });
 const invalidate = useCallback(() => { generation.current++; running.current = false; }, []);
 useLayoutEffect(() => { latest.current = scope; return invalidate; }, [scope, invalidate]);
 const busy = state.scope === scope && state.busy;
 async function run() {
  if (running.current || busy || disabled) return;
  running.current = true;
  const ticket = ++generation.current;
  const current = () => ticket === generation.current && latest.current === scope;
  setState({ scope, busy: true, message: 'Preparing complete filtered export…' });
  try {
   const data = await adminRpc(getSupabaseClient(), token, 'admin_export_v1', { p_kind: kind, p_query: query, p_status: status, p_policy: policy });
   if (!current()) return;
   const { csv, count } = exportCsv(data, kind);
   // Recheck membership immediately before download; never retain a private export in UI state.
   if (!await checkAdmin(getSupabaseClient(), token)) throw new Error('Export access was denied.');
   if (!current()) return;
   downloadCsv(csv, kind);
   setState({ scope, busy: false, message: `Complete export downloaded: ${count} records.` });
  } catch {
   if (current()) setState({ scope, busy: false, message: 'Export failed. Check your administration access and narrow the filters if the result exceeds 10,000 records or 8 MiB. No partial file was downloaded.' });
  } finally { if (ticket === generation.current) running.current = false; }
 }
 return <div className="admin-pagination"><button type="button" disabled={busy || disabled} onClick={() => void run()}>Export filtered {kind} CSV</button>{busy && <button type="button" onClick={() => { generation.current++; running.current = false; setState({ scope, busy: false, message: 'Export cancelled. No file was downloaded.' }); }}>Cancel export</button>}{state.scope === scope && state.message && <p role="status">{state.message}</p>}</div>;
}
