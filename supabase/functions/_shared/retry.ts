import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {deliverConfirmation} from './confirmation.ts';

export type RetryConfiguration = {url: string; key: string};
// Owner chooses an existing named secret API key at deployment. No default
// credential, JWT signing secret, or scheduler identity is invented here.
export function retryConfiguration(env: (name: string) => string | undefined): RetryConfiguration | null {
  const url = env('SUPABASE_URL');
  const name = env('RETRY_SCHEDULER_KEY_NAME');
  if (!url || !name) return null;
  try {
    const keys: unknown = JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}');
    if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return null;
    const key = (keys as Record<string, unknown>)[name];
    return typeof key === 'string' && key.startsWith('sb_secret_') && key.length > 20 ? {url, key} : null;
  } catch { return null; }
}

function sameKey(actual: string, expected: string): boolean {
  const a = new TextEncoder().encode(actual);
  const b = new TextEncoder().encode(expected);
  let difference = a.length ^ b.length;
  for (let i=0; i<b.length; i++) difference |= (a[i] ?? 0) ^ b[i];
  return difference === 0;
}

type RetryDependencies = {
  env: (name: string) => string | undefined;
  client: (configuration: RetryConfiguration) => SupabaseClient;
  deliver: typeof deliverConfirmation;
};
const defaults: RetryDependencies = {
  env: name => Deno.env.get(name),
  client: ({url, key}) => createClient(url, key, {auth: {persistSession: false, autoRefreshToken: false}}),
  deliver: deliverConfirmation,
};
const response = (status: number, body: object) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});

export function retryHandler(dependencies: Partial<RetryDependencies> = {}) {
  const {env, client, deliver} = {...defaults, ...dependencies};
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return new Response(null, {status: 405, headers: {Allow: 'POST'}});
    const configuration = retryConfiguration(env);
    if (!configuration) return response(503, {error: 'scheduler_not_configured'});
    const supplied = request.headers.get('apikey');
    if (!supplied || supplied.length > 1024 || !sameKey(supplied, configuration.key)) return response(401, {error: 'unauthorized'});
    // Do not consume a retry/claim without provider configuration.
    if (!env('RESEND_API_KEY')) return response(503, {error: 'email_not_configured'});
    const admin = client(configuration);
    const {data, error} = await admin.rpc('claim_retry_jobs', {p_batch_size: 50, p_max_attempts: 10});
    if (error || !Array.isArray(data)) return response(503, {error: 'retry_candidates_unavailable'});
    let sent = 0, queued = 0, review = 0;
    for (const candidate of data) {
      if (!candidate || typeof candidate.order_id !== 'string') return response(503, {error: 'invalid_retry_candidate'});
      try {
        const result = await deliver(admin, candidate.order_id);
        if (result === 'sent') sent++;
        else if (result === 'review_required') review++;
        else queued++;
      } catch {
        // No scheduling writes here. The durable lease expires for recovery.
        queued++;
      }
    }
    return response(200, {candidates: data.length, sent, queued, review});
  };
}
