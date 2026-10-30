// PaBs Media — main backend function. All money movement happens here, server-side.
// Deploy as an Edge Function named: api
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (error: string, detail = '') => json({ ok: false, error, detail });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const toKobo = (v: string | number) => Math.round(Number(v) * 100);

// ---------- key encryption (AES-GCM) ----------
async function aesKey() {
  const secret = Deno.env.get('KEYS_ENCRYPTION_SECRET');
  if (!secret || secret.length < 24) throw new Error('KEYS_ENCRYPTION_SECRET missing or too short');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function encrypt(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(), new TextEncoder().encode(plain)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  let s = '';
  for (const b of out) s += String.fromCharCode(b);
  return btoa(s);
}
async function decrypt(b64: string): Promise<string> {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: raw.slice(0, 12) },
    await aesKey(),
    raw.slice(12),
  );
  return new TextDecoder().decode(pt);
}

// ---------- supplier client ----------
class UpstreamError extends Error {
  constructor(public status: number, public code: string, public detail: string) {
    super(`${status} ${code}: ${detail}`);
  }
}
type Upstream = (path: string, init?: RequestInit, timeoutMs?: number) => Promise<any>;

async function makeUpstream(): Promise<Upstream> {
  const { data: s } = await admin.from('app_settings').select('supplier_mode').eq('id', 1).single();
  const live = s?.supplier_mode === 'live';
  const base = live ? Deno.env.get('UPSTREAM_BASE_URL') : `${SUPABASE_URL}/functions/v1/mock-supplier/api/v1`;
  const key = live ? Deno.env.get('UPSTREAM_API_KEY') : SERVICE_KEY;
  if (!base || !key) throw new UpstreamError(0, 'not_configured', 'Supplier credentials are not set');
  return async (path, init = {}, timeoutMs = 20000) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(base + path, {
        ...init,
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      });
      const text = await res.text();
      let body: any = null;
      try { body = JSON.parse(text); } catch { /* not json */ }
      if (!res.ok) throw new UpstreamError(res.status, body?.error ?? `http_${res.status}`, body?.detail ?? text.slice(0, 200));
      return body;
    } catch (e) {
      if (e instanceof UpstreamError) throw e;
      throw new UpstreamError(0, 'network', String(e)); // timeout or connection failure
    } finally {
      clearTimeout(timer);
    }
  };
}

const log = (actor: string | null, action: string, meta: Record<string, unknown> = {}) =>
  admin.from('activity_log').insert({ actor_id: actor, action, meta });
const patchSettings = (patch: Record<string, unknown>) => admin.from('app_settings').update(patch).eq('id', 1);

// ---------- order fulfilment ----------
async function placeOrder(userId: string, body: any) {
  const productId = Number(body.product_id);
  const quantity = Number(body.quantity);
  const key = String(body.idempotency_key ?? '');
  if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 50 || key.length < 8) {
    return fail('bad_request', 'Invalid order.');
  }
  const { data: settings } = await admin.from('app_settings').select('*').eq('id', 1).single();
  if (settings?.purchases_paused) {
    return fail('paused', settings.pause_reason || 'Purchases are temporarily unavailable. Please try again later.');
  }

  const { data, error } = await admin.rpc('create_order', {
    p_user: userId, p_product: productId, p_qty: quantity, p_key: key,
  });
  if (error) {
    const m = error.message ?? '';
    if (m.includes('insufficient_funds')) return fail('insufficient_funds', 'Your wallet balance is too low.');
    if (m.includes('out_of_stock')) return fail('out_of_stock', 'Not enough stock for that quantity.');
    if (m.includes('product_unavailable')) return fail('unavailable', 'This product is not available.');
    console.error('create_order', error);
    return fail('server_error', 'Could not place the order.');
  }
  const order = data.order;
  if (data.existing) return json({ ok: true, order: await publicOrder(order.id) });

  await log(userId, 'order.placed', { order_id: order.id, quantity, total_kobo: order.total_kobo });

  // one supplier purchase at a time
  let locked = false;
  for (let i = 0; i < 20 && !locked; i++) {
    const { data: got } = await admin.rpc('acquire_buy_lock', { p_seconds: 90 });
    locked = got === true;
    if (!locked) await sleep(1000);
  }
  if (!locked) {
    await admin.rpc('refund_order', { p_order: order.id, p_code: 'busy', p_detail: 'Could not get purchase lock', p_final: 'failed' });
    return fail('busy', 'The system is busy. You have not been charged. Please try again.');
  }

  try {
    await fulfil(order);
  } catch (e) {
    console.error('fulfil crashed', e);
    await admin.rpc('mark_needs_review', {
      p_order: order.id, p_code: 'internal_error', p_detail: `Unexpected error during fulfilment: ${e}`,
    });
  } finally {
    await admin.rpc('release_buy_lock');
  }
  return json({ ok: true, order: await publicOrder(order.id) });
}

async function publicOrder(id: string) {
  const { data } = await admin.from('orders')
    .select('id, product_name, quantity, total_kobo, status, created_at').eq('id', id).single();
  if (data && data.status === 'needs_review') data.status = 'processing';
  return data;
}

async function fulfil(order: any) {
  const up = await makeUpstream();
  const { data: prod } = await admin.from('products').select('upstream_product_id').eq('id', order.product_id).single();

  let before: number | null = null;
  try { before = toKobo((await up('/balance')).balance); } catch { before = null; }

  let res: any = null;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await up('/buy', {
        method: 'POST',
        body: JSON.stringify({ product: prod!.upstream_product_id, quantity: order.quantity }),
      }, 30000);
      break;
    } catch (e) {
      if (!(e instanceof UpstreamError)) throw e;
      if (e.status === 429 && attempt < 3) { await sleep(1000 * 2 ** attempt); continue; }
      await handleFailure(order, e, before, up);
      return;
    }
  }
  await handleSuccess(order, res);
}

async function handleSuccess(order: any, res: any) {
  try {
    const keys: string[] = Array.isArray(res.keys) ? res.keys : [];
    if (keys.length === 0) throw new Error('supplier returned no keys');
    const charge = toKobo(res.charge);
    const cipher = await encrypt(JSON.stringify(keys));
    const flag = keys.length !== order.quantity ? 'key_count_mismatch'
      : charge > order.total_kobo ? 'sold_below_cost' : null;
    const { error } = await admin.rpc('complete_order', {
      p_order: order.id, p_upstream_order: res.order_id, p_charge: charge, p_cipher: cipher, p_flag: flag,
    });
    if (error) throw error;
    await log(order.user_id, 'order.completed', { order_id: order.id });
  } catch (e) {
    console.error('handleSuccess', e);
    await admin.rpc('mark_needs_review', {
      p_order: order.id, p_code: 'save_failed',
      p_detail: `Supplier charged us (supplier order ${res?.order_id}) but saving the keys failed: ${e}. Get the keys from the supplier order history.`,
    });
  }
}

async function handleFailure(order: any, e: UpstreamError, before: number | null, up: Upstream) {
  const refund = (code: string, detail: string) =>
    admin.rpc('refund_order', { p_order: order.id, p_code: code, p_detail: detail, p_final: 'failed' });
  await log(order.user_id, 'order.failed', { order_id: order.id, code: e.code, status: e.status });

  if (e.status === 401) {
    await patchSettings({ purchases_paused: true, pause_reason: 'Purchases are temporarily unavailable.', alert: 'Supplier rejected our API key. Check UPSTREAM_API_KEY, then unpause purchases.' });
    await refund('upstream_auth', e.detail);
    return;
  }
  if (e.status === 402) {
    await patchSettings({ purchases_paused: true, pause_reason: 'Purchases are temporarily unavailable.', alert: 'Supplier wallet is too low. Fund it, then unpause purchases.' });
    await refund('upstream_balance', e.detail);
    return;
  }
  if (e.status === 404) {
    await admin.from('products').update({ is_active: false, upstream_missing: true }).eq('id', order.product_id);
    await refund('upstream_not_found', e.detail);
    return;
  }
  if (e.status === 409) {
    await admin.from('products').update({ stock: 0 }).eq('id', order.product_id);
    await refund('upstream_out_of_stock', e.detail);
    return;
  }
  if (e.status >= 400 && e.status < 500) {
    await refund(`upstream_${e.status}`, e.detail); // 429 after retries, 400, 422 ...
    return;
  }

  // timeout / network / 5xx: we do NOT know if the supplier charged us. Check the balance.
  let after: number | null = null;
  try { after = toKobo((await up('/balance')).balance); } catch { after = null; }
  if (before !== null && after !== null) {
    const spent = before - after;
    if (spent <= 0) {
      await refund('upstream_unavailable', `${e.code}; supplier balance unchanged, safe refund`);
      return;
    }
    await admin.rpc('mark_needs_review', {
      p_order: order.id, p_code: 'charged_no_keys',
      p_detail: `Supplier balance dropped by ${spent / 100} NGN but no keys were received (${e.code}). Find the order in the supplier order history, then resolve it here.`,
    });
    return;
  }
  await admin.rpc('mark_needs_review', {
    p_order: order.id, p_code: 'unknown_outcome',
    p_detail: `Could not confirm whether the supplier charged us (${e.code}). Check the supplier order history.`,
  });
}

// ---------- catalogue sync ----------
async function syncProducts() {
  const up = await makeUpstream();
  const cats = (await up('/categories')).results as any[];

  const { data: existingCats } = await admin.from('categories').select('id, upstream_category_id');
  const catByUp = new Map<number, number>((existingCats ?? []).map((c: any) => [c.upstream_category_id, c.id]));
  const newCats = cats.filter((c) => !catByUp.has(c.id))
    .map((c) => ({ upstream_category_id: c.id, name: c.name, slug: c.slug, sort_order: c.id }));
  if (newCats.length) {
    const { data: ins, error } = await admin.from('categories').insert(newCats).select('id, upstream_category_id');
    if (error) throw error;
    for (const c of ins ?? []) catByUp.set(c.upstream_category_id, c.id);
  }

  const items: any[] = [];
  for (let page = 1; page <= 50; page++) {
    const r = await up(`/products?page=${page}`);
    items.push(...r.results);
    if (r.results.length === 0 || items.length >= r.count) break;
  }

  const { data: existing } = await admin.from('products').select('upstream_product_id');
  const have = new Set((existing ?? []).map((p: any) => p.upstream_product_id));
  const base = (p: any) => ({
    upstream_product_id: p.id, upstream_name: p.name,
    upstream_price_kobo: toKobo(p.price), stock: p.stock ?? 0, upstream_missing: false,
  });
  const fresh = items.filter((p) => !have.has(p.id)).map((p) => ({
    ...base(p), category_id: catByUp.get(p.category_id) ?? null, is_active: false,
  }));
  const known = items.filter((p) => have.has(p.id)).map(base);
  if (fresh.length) { const { error } = await admin.from('products').insert(fresh); if (error) throw error; }
  if (known.length) {
    const { error } = await admin.from('products').upsert(known, { onConflict: 'upstream_product_id' });
    if (error) throw error;
  }
  const ids = items.map((p) => p.id);
  let missing = 0;
  if (ids.length) {
    const { data: gone } = await admin.from('products')
      .update({ upstream_missing: true, stock: 0 })
      .not('upstream_product_id', 'in', `(${ids.join(',')})`).eq('upstream_missing', false).select('id');
    missing = gone?.length ?? 0;
  }
  const bal = await checkUpstreamBalance(up);
  return { categories: cats.length, products: items.length, added: fresh.length, missing, balance_kobo: bal };
}

async function checkUpstreamBalance(up?: Upstream) {
  const u = up ?? await makeUpstream();
  const balance = toKobo((await u('/balance')).balance);
  const { data: s } = await admin.from('app_settings').select('low_balance_threshold_kobo, alert').eq('id', 1).single();
  const low = balance < (s?.low_balance_threshold_kobo ?? 0);
  const keepAlert = s?.alert && !String(s.alert).startsWith('Supplier wallet is running low') ? s.alert : null;
  await patchSettings({
    upstream_balance_kobo: balance,
    upstream_balance_checked_at: new Date().toISOString(),
    alert: low ? 'Supplier wallet is running low. Fund it soon.' : keepAlert,
  });
  return balance;
}

// ---------- wallet funding (Paystack) ----------
async function topupInit(profile: any, body: any) {
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret) return fail('payments_not_configured', 'Online payments are not set up yet.');
  const amount = Math.round(Number(body.amount_naira) * 100);
  if (!(amount >= 50000) || amount > 500000000) return fail('bad_amount', 'Enter an amount from ₦500 to ₦5,000,000.');
  const reference = `pabs_${crypto.randomUUID().replaceAll('-', '')}`;
  const site = Deno.env.get('SITE_URL') ?? '';
  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: profile.email, amount, reference, currency: 'NGN', callback_url: `${site}/wallet` }),
  });
  const out = await res.json();
  if (!out.status) return fail('payment_error', 'Could not start the payment.');
  await admin.from('topups').insert({ reference, user_id: profile.id, amount_kobo: amount });
  return json({ ok: true, url: out.data.authorization_url, reference });
}

async function topupVerify(profile: any, body: any) {
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret) return fail('payments_not_configured');
  const reference = String(body.reference ?? '');
  const { data: t } = await admin.from('topups').select('*').eq('reference', reference).single();
  if (!t || t.user_id !== profile.id) return fail('not_found');
  if (t.status === 'success') return json({ ok: true, credited: false });
  const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const out = await res.json();
  if (out.status && out.data?.status === 'success') {
    const { error } = await admin.rpc('credit_topup', { p_reference: reference, p_amount: out.data.amount });
    if (error) return fail('credit_failed', error.message);
    return json({ ok: true, credited: true });
  }
  return json({ ok: true, credited: false, pending: true });
}

// ---------- router ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return fail('unauthorized', 'Please sign in.');
    const { data: profile } = await admin.from('profiles').select('*').eq('id', u.user.id).single();
    if (!profile || profile.is_suspended) return fail('suspended', 'This account is unavailable. Contact support.');

    const body = await req.json();
    const action = String(body.action ?? '');
    const adminOnly = ['sync_products', 'resolve_order', 'wallet_adjust', 'set_suspended', 'check_upstream'];
    if (adminOnly.includes(action) && profile.role !== 'admin') return fail('forbidden', 'Admins only.');

    switch (action) {
      case 'place_order':
        return await placeOrder(profile.id, body);

      case 'order_keys': {
        const { data: o } = await admin.from('orders').select('id, user_id, status').eq('id', body.order_id).single();
        if (!o || (o.user_id !== profile.id && profile.role !== 'admin')) return fail('not_found');
        if (o.status !== 'completed') return fail('not_ready', 'This order has no keys yet.');
        const { data: k } = await admin.from('order_keys').select('ciphertext').eq('order_id', o.id).single();
        if (!k) return fail('not_found');
        await log(profile.id, 'keys.revealed', { order_id: o.id });
        return json({ ok: true, keys: JSON.parse(await decrypt(k.ciphertext)) });
      }

      case 'topup_init': return await topupInit(profile, body);
      case 'topup_verify': return await topupVerify(profile, body);

      case 'sync_products': {
        const result = await syncProducts();
        await log(profile.id, 'admin.sync', result);
        return json({ ok: true, ...result });
      }

      case 'check_upstream':
        return json({ ok: true, balance_kobo: await checkUpstreamBalance() });

      case 'resolve_order': {
        const { order_id, resolution } = body;
        if (resolution === 'refund') {
          await admin.rpc('refund_order', {
            p_order: order_id, p_code: 'admin_refund', p_detail: String(body.note ?? 'Refunded by admin'), p_final: 'refunded',
          });
        } else if (resolution === 'complete') {
          const keys: string[] = (body.keys ?? []).map((k: string) => String(k).trim()).filter(Boolean);
          if (!keys.length) return fail('bad_request', 'Enter at least one key.');
          const { error } = await admin.rpc('complete_order', {
            p_order: order_id,
            p_upstream_order: body.upstream_order_id ? Number(body.upstream_order_id) : null,
            p_charge: body.charge_naira ? toKobo(body.charge_naira) : null,
            p_cipher: await encrypt(JSON.stringify(keys)),
            p_flag: 'manual_resolution',
          });
          if (error) return fail('server_error', error.message);
        } else return fail('bad_request');
        await log(profile.id, 'admin.resolve_order', { order_id, resolution });
        return json({ ok: true });
      }

      case 'wallet_adjust': {
        const amount = toKobo(body.amount_naira);
        if (!Number.isFinite(amount) || amount === 0) return fail('bad_request', 'Enter a non-zero amount.');
        const { data, error } = await admin.rpc('admin_adjust_wallet', {
          p_admin: profile.id, p_user: body.user_id, p_amount: amount, p_note: String(body.note ?? ''),
        });
        if (error) return fail('server_error', error.message.includes('insufficient') ? 'Balance cannot go below zero.' : error.message);
        return json({ ok: true, balance_kobo: data });
      }

      case 'set_suspended': {
        if (body.user_id === profile.id) return fail('bad_request', 'You cannot suspend yourself.');
        await admin.from('profiles').update({ is_suspended: !!body.suspended }).eq('id', body.user_id);
        await log(profile.id, body.suspended ? 'admin.suspend' : 'admin.unsuspend', { user: body.user_id });
        return json({ ok: true });
      }

      default:
        return fail('bad_request', 'Unknown action.');
    }
  } catch (e) {
    console.error(e);
    return fail('server_error', 'Something went wrong.');
  }
});
