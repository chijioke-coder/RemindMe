import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const configured = Boolean(url && key);
export const supabase = createClient(url || 'http://localhost', key || 'missing');

export type ApiResult<T = any> = { ok: boolean; error?: string; detail?: string } & T;

/** Calls the `api` edge function. It always answers with { ok, ... }. */
export async function callApi<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<ApiResult<T>> {
  const { data, error } = await supabase.functions.invoke('api', { body: { action, ...payload } });
  if (error) return { ok: false, error: 'network', detail: 'Could not reach the server. Check your connection and try again.' } as ApiResult<T>;
  return data as ApiResult<T>;
}
