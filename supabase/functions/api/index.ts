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
      return body !== null ? body : text; // keep plain-text replies too
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
  const note = body.customer_note ? String(body.customer_note).slice(0, 500) : null;
  const itemIds: number[] = Array.isArray(body.item_ids)
    ? [...new Set<number>(body.item_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0))] : [];
  if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 50 || key.length < 8) {
    return fail('bad_request', 'Invalid order.');
  }
  const { data: prodInfo } = await admin.from('products').select('pick_items, delivery_type, show_quantity, source').eq('id', productId).single();
  if (prodInfo?.source === 'own' && prodInfo.show_quantity === false && !prodInfo.pick_items && quantity !== 1) {
    return fail('bad_request', 'Only one of this product can be bought at a time.');
  }
  if (prodInfo?.delivery_type === 'unlimited') {
    const { data: c } = await admin.from('product_content').select('product_id').eq('product_id', productId).maybeSingle();
    const { count: fc } = await admin.from('product_files').select('*', { count: 'exact', head: true }).eq('product_id', productId);
    if (!c && !fc) return fail('unavailable', 'This product is not ready yet. Please try again later.');
  }
  if (prodInfo?.pick_items && itemIds.length === 0) return fail('bad_request', 'Choose the items you want to buy.');
  if (itemIds.length > 0 && (!prodInfo?.pick_items || itemIds.length !== quantity)) return fail('bad_request', 'Invalid item selection.');
  let { data: settings } = await admin.from('app_settings').select('*').eq('id', 1).single();
  if (settings?.purchases_paused && settings.auto_paused) {
    // paused by the system, not by you: look again, and resume by itself if the supplier is fine now
    try { await checkUpstreamBalance(); } catch { /* still down */ }
    ({ data: settings } = await admin.from('app_settings').select('*').eq('id', 1).single());
  }
  if (settings?.purchases_paused) {
    return fail('paused', settings.pause_reason || 'Purchases are temporarily unavailable. Please try again later.');
  }

  const { data, error } = await admin.rpc('create_order', {
    p_user: userId, p_product: productId, p_qty: quantity, p_key: key, p_note: note,
  });
  if (error) {
    const m = error.message ?? '';
    if (m.includes('insufficient_funds')) return fail('insufficient_funds', 'Your wallet balance is too low.');
    if (m.includes('out_of_stock')) return fail('out_of_stock', 'Not enough stock for that quantity.');
    if (m.includes('product_unavailable')) return fail('unavailable', 'This product is not available.');
    if (m.includes('input_required')) return fail('input_required', 'Please fill in the required field.');
    console.error('create_order', error);
    return fail('server_error', 'Could not place the order.');
  }
  const order = data.order;
  if (data.existing) return json({ ok: true, order: await publicOrder(order.id) });

  await log(userId, 'order.placed', { order_id: order.id, quantity, total_kobo: order.total_kobo });

  // the owner's own products never touch the supplier
  if (order.delivery_type === 'manual') {
    return json({ ok: true, order: await publicOrder(order.id) }); // waits for the owner to deliver
  }
  if (order.delivery_type === 'stock') {
    await fulfilStock(order, itemIds);
    return json({ ok: true, order: await publicOrder(order.id) });
  }
  if (order.delivery_type === 'unlimited') {
    await fulfilShared(order);
    return json({ ok: true, order: await publicOrder(order.id) });
  }

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
    .select('id, product_name, quantity, total_kobo, status, created_at, delivery_type, error_code').eq('id', id).single();
  if (data && data.status === 'needs_review') data.status = 'processing';
  if (data) {
    data.reason = data.error_code === 'stock_taken' ? 'items_taken' : null;
    delete data.error_code;
  }
  return data;
}

async function fulfilStock(order: any, itemIds: number[] = []) {
  const { data: cipherList, error } = await admin.rpc('claim_stock', { p_order: order.id, p_ids: itemIds.length ? itemIds : null });
  if (error) {
    if ((error.message ?? '').includes('stock_taken')) {
      await admin.rpc('refund_order', { p_order: order.id, p_code: 'stock_taken', p_detail: 'A picked item was bought by someone else', p_final: 'failed' });
    } else if ((error.message ?? '').includes('stock_empty')) {
      await admin.rpc('refund_order', { p_order: order.id, p_code: 'stock_empty', p_detail: 'No stock items left', p_final: 'failed' });
      await admin.from('products').update({ stock: 0 }).eq('id', order.product_id);
    } else {
      await admin.rpc('mark_needs_review', { p_order: order.id, p_code: 'stock_claim_failed', p_detail: errText(error) });
    }
    return;
  }
  try {
    const keys: string[] = [];
    for (const c of cipherList as string[]) { const k = await decrypt(c); if (k) keys.push(k); }
    const { data: fl } = await admin.from('stock_items').select('file_path, file_name')
      .eq('order_id', order.id).not('file_path', 'is', null);
    if (fl && fl.length) {
      const { error: fe } = await admin.from('order_files')
        .insert(fl.map((f: any) => ({ order_id: order.id, path: f.file_path, name: f.file_name ?? 'file' })));
      if (fe) throw fe;
    }
    const { error: ce } = await admin.rpc('complete_order', {
      p_order: order.id, p_upstream_order: null,
      p_charge: Number(order.upstream_unit_cost_kobo) * Number(order.quantity),
      p_cipher: await encrypt(JSON.stringify(keys)), p_flag: null,
    });
    if (ce) throw ce;
    await log(order.user_id, 'order.completed', { order_id: order.id });
  } catch (e) {
    console.error('fulfilStock', e);
    await admin.rpc('mark_needs_review', {
      p_order: order.id, p_code: 'stock_delivery_failed',
      p_detail: `Stock items were reserved but delivery failed: ${errText(e)}. Type the details in yourself, or refund.`,
    });
  }
}

async function fulfilShared(order: any) {
  try {
    const { data: c } = await admin.from('product_content').select('ciphertext').eq('product_id', order.product_id).maybeSingle();
    const text = c ? await decrypt(c.ciphertext) : '';
    const keys = text.split('\n').map((x: string) => x.trim()).filter(Boolean);
    const { data: fl } = await admin.from('product_files').select('path, name').eq('product_id', order.product_id);
    if (fl && fl.length) {
      const { error: fe } = await admin.from('order_files')
        .insert(fl.map((f: any) => ({ order_id: order.id, path: f.path, name: f.name })));
      if (fe) throw fe;
    }
    const { error: ce } = await admin.rpc('complete_order', {
      p_order: order.id, p_upstream_order: null,
      p_charge: Number(order.upstream_unit_cost_kobo) * Number(order.quantity),
      p_cipher: await encrypt(JSON.stringify(keys)), p_flag: null,
    });
    if (ce) throw ce;
    await log(order.user_id, 'order.completed', { order_id: order.id });
  } catch (e) {
    console.error('fulfilShared', e);
    await admin.rpc('mark_needs_review', {
      p_order: order.id, p_code: 'shared_delivery_failed',
      p_detail: `Could not deliver the shared content: ${errText(e)}. Deliver it by hand from Orders, or refund.`,
    });
  }
}

async function recountStock(productId: number) {
  const { count } = await admin.from('stock_items').select('*', { count: 'exact', head: true })
    .eq('product_id', productId).eq('status', 'available');
  await admin.from('products').update({ stock: count ?? 0 }).eq('id', productId);
  return count ?? 0;
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

// ---------- reading whatever the supplier sends back after a purchase ----------
const BOOKKEEPING = new Set(['order_id', 'id', 'product', 'product_id', 'product_name', 'quantity', 'charge', 'price', 'amount', 'total', 'balance', 'currency', 'status', 'message', 'created_at', 'date']);
const DELIVERY_FIELDS = ['keys', 'key', 'items', 'delivered_items', 'delivered', 'delivery', 'deliveries', 'accounts', 'account', 'credentials', 'codes', 'content', 'details', 'data', 'result', 'results'];

function flattenDelivered(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  if (typeof v === 'string') { const t = v.trim(); return t ? [t] : []; }
  if (typeof v === 'number' || typeof v === 'boolean') return [String(v)];
  if (Array.isArray(v)) return v.flatMap(flattenDelivered);
  if (typeof v === 'object') {
    // an item sent as fields (uid, password, 2fa ...) becomes one readable block
    const lines = Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => { const inner = flattenDelivered(val).join(' '); return inner ? `${k}: ${inner}` : ''; })
      .filter(Boolean);
    return lines.length ? [lines.join('\n')] : [];
  }
  return [];
}

function extractDelivered(res: unknown): { items: string[]; recognised: boolean } {
  if (typeof res === 'string' || Array.isArray(res)) {
    const items = flattenDelivered(res);
    return { items, recognised: items.length > 0 };
  }
  if (res && typeof res === 'object') {
    const obj = res as Record<string, unknown>;
    const lower: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(obj)) lower[k.toLowerCase()] = val;
    for (const f of DELIVERY_FIELDS) {
      const val = lower[f];
      if (val === undefined || val === null) continue;
      if (typeof val === 'object' && !Array.isArray(val)) {
        const inner = extractDelivered(val);
        if (inner.items.length) return { items: inner.items, recognised: true };
      }
      const items = flattenDelivered(val);
      if (items.length) return { items, recognised: true };
    }
    // nothing we recognise: hand over everything except bookkeeping, so the buyer never gets nothing
    const rest: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(obj)) if (!BOOKKEEPING.has(k.toLowerCase())) rest[k] = val;
    return { items: flattenDelivered(rest), recognised: false };
  }
  return { items: [], recognised: false };
}

async function handleSuccess(order: any, res: any) {
  try {
    let { items, recognised } = extractDelivered(res);
    let flag: string | null = null;
    if (items.length === 0) {
      // nothing readable: keep the raw reply so nothing the supplier sent is lost
      const raw = typeof res === 'string' ? res.trim() : res == null ? '' : JSON.stringify(res);
      if (!raw) throw new Error('the supplier replied with nothing');
      items = [raw];
      flag = 'raw_response';
    } else if (!recognised) {
      flag = 'unrecognised_format';
    }
    const chargeText = String(res?.charge ?? res?.amount ?? res?.total ?? res?.price ?? '').replace(/[^0-9.]/g, '');
    const charge = chargeText !== '' && Number.isFinite(Number(chargeText))
      ? toKobo(chargeText) : Number(order.upstream_unit_cost_kobo) * Number(order.quantity);
    const supplierOrder = Math.trunc(Number(res?.order_id ?? res?.id));
    if (!flag && items.length !== order.quantity) flag = 'key_count_mismatch';
    if (!flag && charge > order.total_kobo) flag = 'sold_below_cost';

    const cipher = await encrypt(JSON.stringify(items));
    // keep a safe copy first, so nothing the supplier sent can be lost if the next step fails
    await admin.from('order_keys').upsert({ order_id: order.id, ciphertext: cipher }, { onConflict: 'order_id' });
    let lastErr: unknown = null;
    for (let i = 0; i < 2; i++) {
      const { error } = await admin.rpc('complete_order', {
        p_order: order.id, p_upstream_order: Number.isFinite(supplierOrder) ? supplierOrder : null,
        p_charge: charge, p_cipher: cipher, p_flag: flag,
      });
      lastErr = error;
      if (!error) break;
    }
    if (lastErr) throw lastErr;
    await log(order.user_id, 'order.completed', { order_id: order.id });
  } catch (e) {
    console.error('handleSuccess', e);
    await admin.rpc('mark_needs_review', {
      p_order: order.id, p_code: 'save_failed',
      p_detail: `Supplier charged us (supplier order ${res?.order_id ?? 'unknown'}) but delivering failed: ${errText(e)}. Get the items from the supplier order history and deliver them from here.`,
    });
  }
}

async function handleFailure(order: any, e: UpstreamError, before: number | null, up: Upstream) {
  const refund = (code: string, detail: string) =>
    admin.rpc('refund_order', { p_order: order.id, p_code: code, p_detail: detail, p_final: 'failed' });
  await log(order.user_id, 'order.failed', { order_id: order.id, code: e.code, status: e.status });

  if (e.status === 401) {
    await patchSettings({ purchases_paused: true, auto_paused: true, pause_reason: 'Purchases are temporarily unavailable.', alert: 'Supplier rejected our API key. Check UPSTREAM_API_KEY. Selling resumes by itself once the key works.' });
    await refund('upstream_auth', e.detail);
    return;
  }
  if (e.status === 402) {
    await refund('upstream_balance', e.detail);
    try { await checkUpstreamBalance(); } catch { /* the next check will fix the numbers */ }
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
const errText = (e: any) => {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') return [e.message, e.details, e.hint].filter(Boolean).join(' | ') || JSON.stringify(e);
  return String(e);
};

async function syncProducts() {
  const up = await makeUpstream();
  let stage = 'loading categories';
  try {
    const catRes = await up('/categories');
    const cats: any[] = Array.isArray(catRes?.results) ? catRes.results : [];

    const { data: existingCats, error: ce } = await admin.from('categories').select('id, upstream_category_id, slug');
    if (ce) throw ce;
    const catByUp = new Map<number, number>();
    const slugs = new Set<string>();
    for (const c of existingCats ?? []) {
      if (c.upstream_category_id != null) catByUp.set(c.upstream_category_id, c.id);
      slugs.add(c.slug);
    }
    const newCats: any[] = [];
    for (const c of cats) {
      if (catByUp.has(c.id)) continue;
      let slug = String(c.slug || c.name || `cat-${c.id}`).toLowerCase();
      if (slugs.has(slug)) slug = `${slug}-${c.id}`;
      slugs.add(slug);
      newCats.push({ upstream_category_id: c.id, name: String(c.name ?? slug), slug, sort_order: Number(c.id) || 0 });
    }
    if (newCats.length) {
      stage = 'saving categories';
      const { data: ins, error } = await admin.from('categories').insert(newCats).select('id, upstream_category_id');
      if (error) throw error;
      for (const c of ins ?? []) catByUp.set(c.upstream_category_id, c.id);
    }

    stage = 'loading products';
    const seen = new Set<number>();
    const items: any[] = [];
    for (let page = 1; page <= 50; page++) {
      let r: any;
      try {
        r = await up(`/products?page=${page}`);
      } catch (e) {
        if (page > 1 && e instanceof UpstreamError && e.status === 404) break; // ran past the last page
        throw e;
      }
      const results: any[] = Array.isArray(r?.results) ? r.results : [];
      let added = 0;
      for (const p of results) {
        if (p?.id != null && Number.isFinite(Number(p.price)) && !seen.has(p.id)) { seen.add(p.id); items.push(p); added++; }
      }
      if (added === 0 || items.length >= Number(r?.count ?? 0)) break;
    }

    stage = 'saving products';
    const { data: existing, error: pe } = await admin.from('products').select('upstream_product_id');
    if (pe) throw pe;
    const have = new Set((existing ?? []).map((p: any) => p.upstream_product_id));
    const base = (p: any) => ({
      upstream_product_id: p.id, upstream_name: String(p.name ?? `Product ${p.id}`),
      upstream_price_kobo: toKobo(p.price), stock: Number(p.stock ?? 0) || 0, upstream_missing: false,
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
        .not('upstream_product_id', 'in', `(${ids.join(',')})`).eq('source', 'supplier').eq('upstream_missing', false).select('id');
      missing = gone?.length ?? 0;
    }
    stage = 'checking supplier balance';
    const bal = await checkUpstreamBalance(up);
    return { categories: cats.length, products: items.length, added: fresh.length, missing, balance_kobo: bal };
  } catch (e) {
    console.error('sync failed at', stage, e);
    throw new Error(`Sync failed while ${stage}: ${errText(e)}`);
  }
}

async function checkUpstreamBalance(up?: Upstream) {
  const u = up ?? await makeUpstream();
  const balance = toKobo((await u('/balance')).balance);
  if (!Number.isFinite(balance)) throw new Error('the supplier balance could not be read');
  const { data: s } = await admin.from('app_settings')
    .select('low_balance_threshold_kobo, alert, auto_paused').eq('id', 1).single();

  // the cheapest product we could still sell: only warn if the wallet cannot cover even that one
  const { data: cheap } = await admin.from('products').select('upstream_price_kobo')
    .eq('source', 'supplier').eq('is_active', true).eq('upstream_missing', false)
    .gt('stock', 0).gt('upstream_price_kobo', 0)
    .order('upstream_price_kobo', { ascending: true }).limit(1);
  const minCost = cheap && cheap.length ? Number(cheap[0].upstream_price_kobo) : null;

  let alert: string | null = null;
  if (minCost !== null && balance < minCost) {
    alert = `Supplier wallet cannot cover any product right now. Add at least ${((minCost - balance) / 100).toLocaleString('en-NG')} NGN to cover the cheapest one. Orders go through again by themselves once it is funded.`;
  } else if (Number(s?.low_balance_threshold_kobo ?? 0) > 0 && balance < Number(s?.low_balance_threshold_kobo)) {
    alert = 'Supplier wallet is running low. Fund it soon.';
  }
  const keepAlert = s?.alert && !/^Supplier /.test(String(s.alert)) ? s.alert : null; // other alerts are not ours to clear

  const patch: Record<string, unknown> = {
    upstream_balance_kobo: balance,
    upstream_balance_checked_at: new Date().toISOString(),
    alert: alert ?? keepAlert,
  };
  // a successful check means the supplier answers and accepts our key: lift any pause the system set
  if (s?.auto_paused) { patch.purchases_paused = false; patch.auto_paused = false; patch.pause_reason = null; }
  await patchSettings(patch);
  return balance;
}

/** Runs the supplier sync at most once per `minMinutes`, whoever asks (the timer or a visitor). */
async function runAutoSync(minMinutes: number) {
  const { data: mode } = await admin.from('app_settings').select('supplier_mode').eq('id', 1).single();
  if (mode?.supplier_mode !== 'live') return { skipped: 'test mode' };
  const cutoff = new Date(Date.now() - minMinutes * 60 * 1000).toISOString();
  const { data: got } = await admin.from('app_settings').update({ last_sync_at: new Date().toISOString() })
    .eq('id', 1).or(`last_sync_at.is.null,last_sync_at.lt.${cutoff}`).select('id');
  if (!got || got.length === 0) return { skipped: 'recent' };
  try {
    const r = await syncProducts();
    await patchSettings({ last_sync_note: `${r.products} products, ${r.added} new` });
    return r;
  } catch (e) {
    await patchSettings({ last_sync_note: `Failed: ${errText(e)}`.slice(0, 200) });
    return { error: errText(e) };
  }
}

async function refreshBalanceIfStale(seconds: number) {
  const { data: mode } = await admin.from('app_settings').select('supplier_mode').eq('id', 1).single();
  if (mode?.supplier_mode !== 'live') return;
  const stale = new Date(Date.now() - seconds * 1000).toISOString();
  const { data: got } = await admin.from('app_settings').update({ upstream_balance_checked_at: new Date().toISOString() })
    .eq('id', 1).or(`upstream_balance_checked_at.is.null,upstream_balance_checked_at.lt.${stale}`).select('id');
  if (got && got.length) { try { await checkUpstreamBalance(); } catch { /* try again next time */ } }
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
    body: JSON.stringify({
      email: profile.email, amount, reference, currency: 'NGN', callback_url: `${site}/wallet`,
      ...(body.channel === 'bank_transfer' ? { channels: ['bank_transfer'] } : {}),
    }),
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

// ---------- virtual numbers: shared pieces ----------
type FsRes = { status: number; text: string; json: any };

const smsRefund = (order: any, code: string, detail: string, final = 'failed') =>
  admin.rpc('refund_order', { p_order: order.id, p_code: code, p_detail: detail, p_final: final });

async function maybeSweepSms(force = false) {
  const cutoff = new Date(Date.now() - 60 * 1000).toISOString();
  if (!force) {
    const { data: got } = await admin.from('app_settings').update({ sms_last_sweep: new Date().toISOString() })
      .eq('id', 1).or(`sms_last_sweep.is.null,sms_last_sweep.lt.${cutoff}`).select('id');
    if (!got || got.length === 0) return 0;
  }
  return await heroPollThrottled(force ? 0 : 1500);
}

async function buyNumber(profile: any, body: any) {
  const country = String(body.country ?? '');
  const service = String(body.service ?? '');
  const key = String(body.idempotency_key ?? '');
  if (!/^[a-z0-9_-]{2,60}$/i.test(country) || !/^[a-z0-9_.-]{1,60}$/i.test(service) || key.length < 8) return fail('bad_request', 'Invalid request.');
  const { data: settings } = await admin.from('app_settings').select('*').eq('id', 1).single();
  if (settings?.purchases_paused) return fail('paused', settings.pause_reason || 'Purchases are temporarily unavailable.');
  if (!settings?.sms_show) return fail('unavailable', 'Virtual numbers are not available right now.');
  if (!isHeroSlug(country) || !Deno.env.get('HEROSMS_API_KEY')) return fail('unavailable', 'This number is not available right now. Please pick another.');

  const { data, error } = await admin.rpc('create_sms_order', { p_user: profile.id, p_country: country, p_service: service, p_key: key });
  if (error) {
    const m = error.message ?? '';
    if (m.includes('insufficient_funds')) return fail('insufficient_funds', 'Your wallet balance is too low.');
    if (m.includes('offer_unavailable')) return fail('unavailable', 'This number is not available right now. Please pick another.');
    console.error('create_sms_order', error);
    return fail('server_error', 'Could not place the order.');
  }
  const order = data.order;
  if (data.existing) return json({ ok: true, order: await publicOrder(order.id) });
  await log(profile.id, 'order.placed', { order_id: order.id, total_kobo: order.total_kobo, kind: 'sms' });

  try {
    await heroPurchase(order, country, service);
  } catch (e) {
    console.error('heroPurchase', e);
    await admin.rpc('mark_needs_review', { p_order: order.id, p_code: 'sms_internal_error', p_detail: `Unexpected error while buying the number: ${errText(e)}` });
  }
  void heroPollThrottled(0);
  return json({ ok: true, order: await publicOrder(order.id) });
}

async function smsOrderForUser(profile: any, orderId: string) {
  const { data: o } = await admin.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!o || o.delivery_type !== 'sms' || (o.user_id !== profile.id && profile.role !== 'admin')) return null;
  return o;
}

async function smsStateResponse(orderId: string, extra: Record<string, unknown> = {}) {
  const { data: o } = await admin.from('orders').select('*').eq('id', orderId).single();
  const out: Record<string, unknown> = {
    ok: true, status: o?.status === 'needs_review' ? 'processing' : o?.status, phone: o?.sms_phone ?? null, expires: o?.sms_expires ?? null,
    now: Date.now(),
    // after the first code the number keeps listening a little while for a second SMS
    listening: o?.status === 'completed' && o?.hero_finished === false,
    ...extra,
  };
  if (o?.status === 'completed') {
    const { data: k } = await admin.from('order_keys').select('ciphertext').eq('order_id', orderId).maybeSingle();
    if (k) out.items = JSON.parse(await decrypt(k.ciphertext));
  }
  return json(out);
}

// ---------- HeroSMS virtual numbers ----------
// Offers live in sms_countries / sms_services / sms_offers. A country slug is "hero_<HeroSMS country id>".
const HERO_BASE = 'https://hero-sms.com/api/v1';
const HERO_LEGACY = 'https://hero-sms.com/stubs/handler_api.php';
const HERO_PREFIX = 'hero_';
const HERO_EXTRA_WINDOW_MS = 3 * 60 * 1000; // keep listening for a second SMS this long after the first one
const HERO_SELL_MARGIN = 1.15; // never pay HeroSMS more than 15% above the listed price
const isHeroSlug = (s: string) => s.startsWith(HERO_PREFIX);

// HeroSMS short codes with a friendlier slug
const HERO_SERVICE_MAP: Record<string, string> = {
  wa: 'whatsapp', tg: 'telegram', ig: 'instagram', fb: 'facebook', go: 'google',
  ds: 'discord', tw: 'twitter', ub: 'uber', am: 'amazon',
};
const HERO_SERVICE_REV: Record<string, string> = Object.fromEntries(Object.entries(HERO_SERVICE_MAP).map(([c, s]) => [s, c]));
const heroServiceSlug = (code: string) => HERO_SERVICE_MAP[code] ?? `${HERO_PREFIX}${code}`;
const heroServiceCode = (slug: string) => HERO_SERVICE_REV[slug] ?? (isHeroSlug(slug) ? slug.slice(HERO_PREFIX.length) : slug);

/** Calls the HeroSMS v1 API. Never throws: status 0 means timeout or no connection. */
async function hero(path: string, init: { method?: string; body?: unknown } = {}, timeoutMs = 15000): Promise<FsRes> {
  const key = Deno.env.get('HEROSMS_API_KEY');
  if (!key) return { status: 0, text: 'HEROSMS_API_KEY is not set', json: null };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(HERO_BASE + path, {
      method: init.method ?? 'GET',
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json', Authorization: `ApiKey ${key}`,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* empty or plain text reply */ }
    return { status: res.status, text, json };
  } catch (e) {
    return { status: 0, text: String(e), json: null };
  } finally {
    clearTimeout(timer);
  }
}

/** HeroSMS also speaks the old SMS-Activate protocol. Used only for the name lists and the balance. */
async function heroLegacy(action: string, params: Record<string, string> = {}, timeoutMs = 15000): Promise<FsRes> {
  const key = Deno.env.get('HEROSMS_API_KEY');
  if (!key) return { status: 0, text: 'HEROSMS_API_KEY is not set', json: null };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${HERO_LEGACY}?${new URLSearchParams({ api_key: key, action, ...params })}`, { signal: ctrl.signal });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* plain text such as ACCESS_BALANCE:1.23 */ }
    return { status: res.status, text, json };
  } catch (e) {
    return { status: 0, text: String(e), json: null };
  } finally {
    clearTimeout(timer);
  }
}

// --- small pure helpers (kept free of database calls so they are easy to test) ---
/** HeroSMS sends microsecond timestamps; make them safe to parse. */
const heroMs = (s: unknown): number => Date.parse(String(s ?? '').replace(/(\.\d{3})\d+/, '$1'));
const heroSec = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const heroHasOtp = (a: any) => !!(String(a?.otpLast?.smsCode ?? '').trim() || String(a?.otpLast?.smsText ?? '').trim());
const heroOtpKey = (o: any) => String(o?.id ?? o?.smsText ?? o?.smsCode ?? '');
function heroOtpItems(o: any): string[] {
  const code = String(o?.smsCode ?? '').trim();
  const text = String(o?.smsText ?? '').trim();
  return [code ? `Code: ${code}` : '', text ? `Message: ${text}` : ''].filter(Boolean);
}

/** {service:{countryId:{prices:{default},counts:{defaultPrice,total}}}} -> flat list of buyable offers */
function heroParseOffers(json: any) {
  const data = json?.data ?? json ?? {};
  const out: { service: string; country: number; usd: number; count: number }[] = [];
  for (const [service, byCountry] of Object.entries(data as Record<string, any>)) {
    if (!/^[a-z0-9_]{1,10}$/i.test(service) || !byCountry || typeof byCountry !== 'object') continue;
    for (const [cid, o] of Object.entries(byCountry as Record<string, any>)) {
      const usd = Number(o?.prices?.default ?? o?.prices?.retail ?? o?.prices?.min);
      const count = Number(o?.counts?.defaultPrice ?? o?.counts?.total ?? 0);
      if (!/^\d+$/.test(cid) || !Number.isFinite(usd) || usd <= 0 || !(count > 0)) continue;
      out.push({ service, country: Number(cid), usd, count });
    }
  }
  return out;
}

function heroParseCountryNames(json: any): Map<number, string> {
  const m = new Map<number, string>();
  const list: any[] = Array.isArray(json) ? json : Object.values(json ?? {});
  for (const c of list) {
    const id = Number(c?.id);
    const name = String(c?.eng ?? c?.name ?? c?.title ?? '').trim();
    if (Number.isInteger(id) && name) m.set(id, name);
  }
  return m;
}

function heroParseServiceNames(json: any): Map<string, string> {
  const m = new Map<string, string>();
  let list: any[] = Array.isArray(json?.services) ? json.services : Array.isArray(json) ? json : [];
  if (!list.length && json && typeof json === 'object') {
    list = Object.entries(json).map(([code, v]: [string, any]) => ({ code, name: typeof v === 'string' ? v : v?.name }));
  }
  for (const s of list) {
    const code = String(s?.code ?? '').trim();
    const name = String(s?.name ?? '').trim();
    if (code && name) m.set(code, name);
  }
  return m;
}

/** supabase returns at most 1000 rows per request: read everything in pages */
async function allRows(table: string, select: string, filter: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await filter(admin.from(table).select(select)).range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// --- catalogue sync: one call for every app and country, prices converted to the shared unit ---
async function heroSyncCatalog() {
  if (!Deno.env.get('HEROSMS_API_KEY')) throw new Error('HEROSMS_API_KEY is not set');
  const started = new Date().toISOString();
  const { data: st } = await admin.from('app_settings').select('sms_rate_naira, hero_rate_naira').eq('id', 1).single();
  const heroRate = Number(st?.hero_rate_naira) || 0;
  // prices in sms_offers are in "units" that the store multiplies by sms_rate_naira. Dividing by it here
  // makes a HeroSMS dollar come out as exactly hero_rate_naira naira (sms_rate_naira is kept at 1).
  const unit = Number(st?.sms_rate_naira) > 0 ? Number(st?.sms_rate_naira) : 1;

  const r = await hero('/activations/offers/sms', {}, 60000);
  if (r.status !== 200 || !r.json) throw new Error(`HeroSMS offers failed (${r.status}): ${r.text.slice(0, 120)}`);
  const offers = heroParseOffers(r.json);

  // names and our own success rates are nice to have: a failure here never stops the sync
  const [cn, sn, stats] = await Promise.all([heroLegacy('getCountries'), heroLegacy('getServicesList', { lang: 'en' }), hero('/activations/stats')]);
  const cNames = heroParseCountryNames(cn.json);
  const sNames = heroParseServiceNames(sn.json);
  const rates = new Map<string, number>();
  if (stats.status === 200 && stats.json?.data && typeof stats.json.data === 'object') {
    for (const [cid, svcs] of Object.entries(stats.json.data as Record<string, any>)) {
      for (const [svc, v] of Object.entries((svcs ?? {}) as Record<string, any>)) {
        if (Number(v?.count) >= 5 && Number.isFinite(Number(v?.percent))) rates.set(`${cid}/${svc}`, Number(v.percent));
      }
    }
  }

  const cids = [...new Set(offers.map((o) => o.country))];
  const codes = [...new Set(offers.map((o) => o.service))];
  const countryRows = cids.map((id) => ({ slug: `${HERO_PREFIX}${id}`, name: cNames.get(id) ?? `Country ${id}` }));
  for (let i = 0; i < countryRows.length; i += 200) {
    const { error } = await admin.from('sms_countries').upsert(countryRows.slice(i, i + 200), { onConflict: 'slug' });
    if (error) throw error;
  }
  const ownSvc = codes.filter((c) => !HERO_SERVICE_MAP[c]).map((c) => ({ slug: heroServiceSlug(c), name: sNames.get(c) ?? c.toUpperCase() }));
  const sharedSvc = codes.filter((c) => HERO_SERVICE_MAP[c]).map((c) => ({ slug: heroServiceSlug(c), name: sNames.get(c) ?? heroServiceSlug(c) }));
  for (let i = 0; i < ownSvc.length; i += 500) {
    const { error } = await admin.from('sms_services').upsert(ownSvc.slice(i, i + 500), { onConflict: 'slug' });
    if (error) throw error;
  }
  if (sharedSvc.length) { // keep any name or switch you already changed
    const { error } = await admin.from('sms_services').upsert(sharedSvc, { onConflict: 'slug', ignoreDuplicates: true });
    if (error) throw error;
  }

  // only keep prices for what you switched on (there are tens of thousands of combinations)
  const activeC = new Set((await allRows('sms_countries', 'slug', (q) => q.like('slug', 'hero\\_%').eq('is_active', true))).map((x) => x.slug));
  const activeS = new Set((await allRows('sms_services', 'slug', (q) => q.eq('is_active', true))).map((x) => x.slug));
  const now = new Date().toISOString();
  const rows = heroRate > 0
    ? offers
      .filter((o) => activeC.has(`${HERO_PREFIX}${o.country}`) && activeS.has(heroServiceSlug(o.service)))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15000)
      .map((o) => ({
        country: `${HERO_PREFIX}${o.country}`, service: heroServiceSlug(o.service),
        cost: Math.round((o.usd * heroRate / unit) * 1e6) / 1e6, count: o.count,
        rate: rates.get(`${o.country}/${o.service}`) ?? null, usd_price: o.usd, updated_at: now,
      }))
    : [];
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from('sms_offers').upsert(rows.slice(i, i + 500), { onConflict: 'country,service' });
    if (error) throw error;
  }
  // anything HeroSMS no longer lists (or you switched off) is out of stock
  await admin.from('sms_offers').update({ count: 0 }).like('country', 'hero\\_%').lt('updated_at', started);
  await patchSettings({ hero_last_sync_at: new Date().toISOString() });
  return {
    countries: cids.length, apps: codes.length, found: offers.length, offers: rows.length,
    rate_missing: heroRate <= 0, names_missing: cNames.size === 0 || sNames.size === 0,
  };
}

async function runHeroAutoSync(minMinutes: number) {
  if (!Deno.env.get('HEROSMS_API_KEY')) return { skipped: 'no key' };
  const cutoff = new Date(Date.now() - minMinutes * 60 * 1000).toISOString();
  const { data: got } = await admin.from('app_settings').update({ hero_last_sync_at: new Date().toISOString() })
    .eq('id', 1).or(`hero_last_sync_at.is.null,hero_last_sync_at.lt.${cutoff}`).select('id');
  if (!got || got.length === 0) return { skipped: 'recent' };
  try { return await heroSyncCatalog(); } catch (e) { console.error('hero sync', e); return { error: errText(e) }; }
}

// --- buying ---
async function heroAttach(order: any, a: any) {
  const phone = String(a.phone ?? '').replace(/\D/g, '');
  const exp = heroMs(a.expiredAt);
  const price = Number(a.price);
  await admin.from('orders').update({
    sms_provider: 'hero', sms_order_id: a.id, upstream_order_id: a.id,
    sms_phone: phone ? `+${phone}` : null,
    sms_expires: new Date(Number.isFinite(exp) ? exp : Date.now() + 20 * 60 * 1000).toISOString(),
    sms_price: Number.isFinite(price) ? price : null,
  }).eq('id', order.id);
}

async function heroPurchase(order: any, country: string, service: string) {
  const cid = Number(country.slice(HERO_PREFIX.length));
  const code = heroServiceCode(service);
  // mark the order as a HeroSMS one BEFORE talking to HeroSMS, so no sweep can mistake it for another kind of order
  const { error: me } = await admin.from('orders').update({ sms_provider: 'hero', hero_country: String(cid), hero_service: code }).eq('id', order.id);
  if (me) { await smsRefund(order, 'sms_not_ready', errText(me)); return; }

  const { data: offer } = await admin.from('sms_offers').select('usd_price').eq('country', country).eq('service', service).maybeSingle();
  const usd = Number(offer?.usd_price) || 0;
  const body: Record<string, unknown> = {
    service: code, country: cid, amount: 1, verificationType: 'sms', resellerUserId: String(order.user_id).slice(0, 36),
  };
  if (usd > 0) { body.maxPrice = Math.ceil(usd * HERO_SELL_MARGIN * 10000) / 10000; body.fixedPrice = false; }

  let r = await hero('/activations', { method: 'POST', body }, 25000);
  if (r.status === 429) { await sleep(1000); r = await hero('/activations', { method: 'POST', body }, 25000); }
  const a = Array.isArray(r.json?.data) ? r.json.data[0] : r.json?.data;
  if (r.status === 200 && a?.id) { await heroAttach(order, a); return; }

  const note = r.text.slice(0, 150);
  if (r.status === 200 || r.status === 404) { // no number available right now
    await admin.from('sms_offers').update({ count: 0 }).eq('country', country).eq('service', service);
    await smsRefund(order, 'sms_no_stock', note);
  } else if (r.status === 401) {
    await patchSettings({ alert: 'HeroSMS rejected the API key. Check the HEROSMS_API_KEY secret.' });
    await smsRefund(order, 'sms_auth', note);
  } else if (r.status === 403) {
    await patchSettings({ alert: `HeroSMS refused a purchase (403). Check your HeroSMS balance and account. ${note}`.slice(0, 300) });
    await smsRefund(order, 'sms_forbidden', note);
  } else if (r.status === 400 || r.status === 422) {
    await smsRefund(order, 'sms_rejected', note);
  } else if (r.status === 429) {
    await smsRefund(order, 'sms_busy', 'HeroSMS busy (429)');
  }
  // timeout or 5xx: we cannot know if HeroSMS issued a number. The order stays "processing";
  // the next poll adopts the number if HeroSMS made one, or refunds after 3 minutes if it did not.
}

// --- receiving codes ---
type HeroCtx = { byId: Map<number, any>; active: any[]; claimed: Set<number>; rate: number };

async function heroFetchActive(): Promise<any[] | null> {
  const all: any[] = [];
  for (let page = 1; page <= 8; page++) {
    const r = await hero(`/activations?size=25&page=${page}&sort%5Bid%5D=desc`);
    if (r.status !== 200 || !r.json) return page === 1 ? null : all;
    all.push(...(Array.isArray(r.json.data) ? r.json.data : []));
    if (!r.json.meta?.hasMore) break;
  }
  return all;
}

async function heroHistoryFind(order: any): Promise<any | null> {
  const from = heroSec(Date.parse(order.created_at) - 10 * 60 * 1000);
  const to = heroSec(Date.now() + 10 * 60 * 1000);
  const r = await hero(`/activations/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&size=25&sort%5Bid%5D=desc`);
  if (r.status !== 200) return null;
  const rows: any[] = Array.isArray(r.json?.data) ? r.json.data : [];
  return rows.find((x) => Number(x.id) === Number(order.sms_order_id)) ?? null;
}

async function heroDeliver(order: any, a: any, rate: number) {
  const otp = a.otpLast ?? {};
  const items = heroOtpItems(otp);
  if (!items.length) return;
  try {
    const price = Number(a.price);
    const charge = Number.isFinite(price) && price > 0 && rate > 0 ? Math.round(price * rate * 100) : Number(order.upstream_unit_cost_kobo) || 0;
    const { error } = await admin.rpc('complete_order', {
      p_order: order.id, p_upstream_order: Number(a.id) || null, p_charge: charge,
      p_cipher: await encrypt(JSON.stringify(items)), p_flag: null,
    });
    if (error) throw error;
    await admin.from('orders').update({ hero_otp_id: heroOtpKey(otp), hero_first_otp_at: new Date().toISOString(), hero_finished: false }).eq('id', order.id);
    await log(order.user_id, 'order.completed', { order_id: order.id, kind: 'sms', provider: 'hero' });
  } catch (e) {
    console.error('heroDeliver', e);
    await admin.rpc('mark_needs_review', {
      p_order: order.id, p_code: 'sms_save_failed',
      p_detail: `The code arrived (HeroSMS activation ${a.id}) but saving failed: ${errText(e)}. Find it in your HeroSMS history and deliver it by hand.`,
    });
  }
}

/** a second SMS on the same number: add it under the first one */
async function heroAppend(order: any, otp: any) {
  const { data: k } = await admin.from('order_keys').select('ciphertext').eq('order_id', order.id).maybeSingle();
  const items: string[] = k ? JSON.parse(await decrypt(k.ciphertext)) : [];
  items.push(...heroOtpItems(otp));
  await admin.from('order_keys').upsert({ order_id: order.id, ciphertext: await encrypt(JSON.stringify(items)) }, { onConflict: 'order_id' });
  await admin.from('orders').update({ hero_otp_id: heroOtpKey(otp) }).eq('id', order.id);
}

async function heroFinish(order: any) {
  if (order.sms_order_id) await hero(`/activations/${Number(order.sms_order_id)}/finish`, { method: 'POST' });
  await admin.from('orders').update({ hero_finished: true }).eq('id', order.id);
}

/** the number is gone from HeroSMS's active list and no code came: find out why, refund when it is safe */
async function heroResolveGone(order: any, exp: number, id: number, age: number) {
  const h = await heroHistoryFind(order);
  const st = Number(h?.status);
  if (st === 8 || st === 10) { await smsRefund(order, st === 8 ? 'sms_cancelled_upstream' : 'sms_refunded_upstream', `HeroSMS status ${st}`); return; }
  if (st === 6 && String(h?.moreCodes ?? '').trim()) {
    const text = String(h.moreCodes).trim();
    const code = text.match(/\b(\d{4,8})\b/)?.[1] ?? '';
    await heroDeliver(order, { id, price: h.cost, otpLast: { id: `h${id}`, smsCode: code, smsText: text } }, 0);
    return;
  }
  const late = Number.isFinite(exp) ? Date.now() > exp + 2 * 60 * 1000 : age > 25 * 60 * 1000;
  if (late) await smsRefund(order, 'sms_timeout', `HeroSMS order ${id} ended without a code`);
}

async function heroAdvanceOne(order: any, ctx: HeroCtx, opts: { cancel?: boolean } = {}): Promise<{ cancelled?: boolean; cancelFailed?: boolean }> {
  const now = Date.now();
  if (order.status === 'completed') { // already delivered; still listening for a second SMS
    const a = ctx.byId.get(Number(order.sms_order_id));
    if (a && heroHasOtp(a) && heroOtpKey(a.otpLast) !== String(order.hero_otp_id ?? '')) await heroAppend(order, a.otpLast);
    const first = order.hero_first_otp_at ? Date.parse(order.hero_first_otp_at) : 0;
    if (!a || now - first > HERO_EXTRA_WINDOW_MS) await heroFinish(order);
    return {};
  }
  if (order.status !== 'processing') return {};
  const age = now - Date.parse(order.created_at);

  if (!order.sms_order_id) {
    // the purchase call never answered: did HeroSMS issue a number anyway?
    const hit = ctx.active.find((a) => String(a.service) === String(order.hero_service) && String(a.country) === String(order.hero_country)
      && heroMs(a.createdAt) >= Date.parse(order.created_at) - 60 * 1000 && !ctx.claimed.has(Number(a.id)));
    if (!hit) {
      if (age > 3 * 60 * 1000) await smsRefund(order, 'sms_not_started', 'The number was never issued');
      return {};
    }
    ctx.claimed.add(Number(hit.id));
    await heroAttach(order, hit);
    order = { ...order, sms_order_id: hit.id, sms_expires: new Date(heroMs(hit.expiredAt) || now + 20 * 60 * 1000).toISOString() };
  }

  const id = Number(order.sms_order_id);
  const a = ctx.byId.get(id);
  if (a && heroHasOtp(a)) { await heroDeliver(order, a, ctx.rate); return {}; }

  const exp = order.sms_expires ? Date.parse(order.sms_expires) : heroMs(a?.expiredAt);
  const expired = Number.isFinite(exp) && exp <= now;
  if (!a && !opts.cancel) { await heroResolveGone(order, exp, id, age); return {}; }

  if (opts.cancel || expired) {
    const x = await hero(`/activations/${id}`, { method: 'DELETE' });
    if (x.status === 204 || x.status === 200) {
      await smsRefund(order, opts.cancel ? 'sms_cancelled' : 'sms_timeout', opts.cancel ? 'Cancelled by the customer' : 'No SMS arrived in time', opts.cancel ? 'refunded' : 'failed');
      return { cancelled: true };
    }
    // refused: a code may have just arrived, or it is too early to cancel
    if (opts.cancel) return { cancelFailed: true };
    if (now > exp + 5 * 60 * 1000) await heroResolveGone(order, exp, id, age);
  }
  return {};
}

/** One HeroSMS call serves every waiting customer: it lists all active numbers with their latest code. */
async function heroPollAll(): Promise<number> {
  const { data: watch } = await admin.from('orders').select('*')
    .eq('delivery_type', 'sms').eq('sms_provider', 'hero')
    .or('status.eq.processing,and(status.eq.completed,hero_finished.eq.false)').limit(200);
  const list = watch ?? [];
  if (!list.length) return 0;
  const active = await heroFetchActive();
  if (active === null) { console.error('hero poll: could not read the active list'); return 0; }
  const byId = new Map<number, any>(active.map((a) => [Number(a.id), a]));
  const ids = active.map((a) => Number(a.id)).filter(Number.isFinite);
  const { data: used } = ids.length ? await admin.from('orders').select('sms_order_id').in('sms_order_id', ids) : { data: [] as any[] };
  const claimed = new Set<number>((used ?? []).map((u: any) => Number(u.sms_order_id)));
  const { data: st } = await admin.from('app_settings').select('hero_rate_naira').eq('id', 1).single();
  const ctx: HeroCtx = { byId, active, claimed, rate: Number(st?.hero_rate_naira) || 0 };
  for (const o of list) { try { await heroAdvanceOne(o, ctx); } catch (e) { console.error('hero advance', e); } }
  return list.length;
}

/** Runs the shared poll at most once per `minMs`, whoever asks. Everyone else just reads the saved result. */
async function heroPollThrottled(minMs = 1500): Promise<number> {
  if (!Deno.env.get('HEROSMS_API_KEY')) return 0;
  const cutoff = new Date(Date.now() - minMs).toISOString();
  const lockUntil = new Date(Date.now() + 25000).toISOString(); // a crashed poll frees itself after 25s
  const { data: got } = await admin.from('app_settings').update({ hero_last_poll: lockUntil })
    .eq('id', 1).or(`hero_last_poll.is.null,hero_last_poll.lt.${cutoff}`).select('id');
  if (!got || got.length === 0) return 0;
  try { return await heroPollAll(); }
  finally { await admin.from('app_settings').update({ hero_last_poll: new Date().toISOString() }).eq('id', 1); }
}

async function heroCancel(order: any) {
  const active = await heroFetchActive();
  if (active === null) return { cancelFailed: true };
  const { data: fresh } = await admin.from('orders').select('*').eq('id', order.id).single();
  if (!fresh || fresh.status !== 'processing') return {};
  const byId = new Map<number, any>(active.map((a) => [Number(a.id), a]));
  return await heroAdvanceOne(fresh, { byId, active, claimed: new Set(), rate: 0 }, { cancel: true });
}

// ---------- router ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));

    // the 10-minute timer (database side). It proves itself with a secret that only the database and this function know.
    if (body.action === 'cron_run') {
      const { data: cfg } = await admin.from('cron_config').select('secret').eq('id', 1).maybeSingle();
      if (!cfg?.secret || req.headers.get('x-cron-key') !== cfg.secret) return fail('unauthorized', 'Bad timer key.');
      const sync = await runAutoSync(8);
      await refreshBalanceIfStale(0);
      const heroSync = await runHeroAutoSync(5);
      const swept = await maybeSweepSms(true);
      return json({ ok: true, sync, heroSync, swept });
    }

    // any visitor opening the site gives the sync a nudge (it only runs when 10 minutes have passed)
    if (body.action === 'maybe_sync') {
      await refreshBalanceIfStale(120);
      const sync = await runAutoSync(10);
      void maybeSweepSms(); // a visitor also nudges waiting number orders (it only runs once a minute)
      return json({ ok: true, sync });
    }

    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return fail('unauthorized', 'Please sign in.');
    const { data: profile } = await admin.from('profiles').select('*').eq('id', u.user.id).single();
    if (!profile || profile.is_suspended) return fail('suspended', 'This account is unavailable. Contact support.');

    const action = String(body.action ?? '');
    const adminOnly = ['sync_products', 'resolve_order', 'wallet_adjust', 'set_suspended', 'check_upstream', 'add_stock', 'clear_stock', 'list_stock', 'remove_stock_item', 'add_stock_file', 'order_note', 'testlab_overdue', 'get_shared', 'set_shared_text', 'add_shared_file', 'remove_shared_file', 'sms_sweep', 'cron_register', 'hero_sync', 'hero_profile'];
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
        const { data: fl } = await admin.from('order_files').select('path, name').eq('order_id', o.id);
        const files: { name: string; url: string }[] = [];
        for (const f of fl ?? []) {
          const { data: su } = await admin.storage.from('delivery-files').createSignedUrl(f.path, 900, { download: f.name });
          if (su?.signedUrl) files.push({ name: f.name, url: su.signedUrl });
        }
        return json({ ok: true, keys: JSON.parse(await decrypt(k.ciphertext)), files });
      }

      case 'topup_init': return await topupInit(profile, body);
      case 'topup_verify': return await topupVerify(profile, body);

      case 'sync_products': {
        try {
          const result = await syncProducts();
          await log(profile.id, 'admin.sync', result);
          return json({ ok: true, ...result });
        } catch (e) {
          return fail('sync_failed', errText(e));
        }
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
          const files: { path: string; name: string }[] = Array.isArray(body.files) ? body.files : [];
          if (!keys.length && !files.length) return fail('bad_request', 'Add a message, a link or a file to deliver.');
          for (const f of files) {
            if (!String(f.path ?? '').startsWith(`orders/${order_id}/`)) return fail('bad_request', 'Bad file path.');
          }
          if (files.length) {
            const { error: fe } = await admin.from('order_files')
              .insert(files.map((f) => ({ order_id, path: f.path, name: String(f.name ?? 'file').slice(0, 200) })));
            if (fe) return fail('server_error', errText(fe));
          }
          const { data: ord } = await admin.from('orders')
            .select('delivery_type, upstream_unit_cost_kobo, quantity').eq('id', order_id).single();
          const defaultCharge = ord && ord.delivery_type !== 'supplier'
            ? Number(ord.upstream_unit_cost_kobo) * Number(ord.quantity) : null;
          const { error } = await admin.rpc('complete_order', {
            p_order: order_id,
            p_upstream_order: body.upstream_order_id ? Number(body.upstream_order_id) : null,
            p_charge: body.charge_naira ? toKobo(body.charge_naira) : defaultCharge,
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

      case 'add_stock': {
        const { data: p } = await admin.from('products').select('id, delivery_type, pick_items').eq('id', body.product_id).single();
        if (!p || p.delivery_type !== 'stock') return fail('bad_request', 'This product does not use uploaded stock.');
        const lines: string[] = [...new Set<string>((body.items ?? []).map((x: unknown) => String(x).trim()).filter(Boolean))].slice(0, 500);
        if (!lines.length) return fail('bad_request', 'Add at least one item.');
        const rows: { product_id: number; ciphertext: string; label: string | null }[] = [];
        for (const line of lines) {
          const at = line.indexOf('##');
          const label = at > -1 ? line.slice(0, at).trim() : '';
          const details = at > -1 ? line.slice(at + 2).trim() : line;
          if (!details) return fail('bad_request', `This line has no details after ##: ${line.slice(0, 40)}`);
          if (p.pick_items && !label) return fail('bad_request', `Every line needs a label, like: label ## details. Missing on: ${line.slice(0, 40)}`);
          rows.push({ product_id: p.id, ciphertext: await encrypt(details), label: label || null });
        }
        const { error } = await admin.from('stock_items').insert(rows);
        if (error) return fail('server_error', errText(error));
        const stock = await recountStock(p.id);
        await log(profile.id, 'admin.add_stock', { product_id: p.id, added: rows.length });
        return json({ ok: true, added: rows.length, stock });
      }

      case 'add_stock_file': {
        const { data: p } = await admin.from('products').select('id, delivery_type, pick_items').eq('id', body.product_id).single();
        if (!p || p.delivery_type !== 'stock') return fail('bad_request', 'This product does not use uploaded stock.');
        const label = String(body.label ?? '').trim();
        const details = String(body.details ?? '').trim();
        const path = String(body.file_path ?? '');
        if (!path.startsWith(`stock/${p.id}/`)) return fail('bad_request', 'Bad file path.');
        if (p.pick_items && !label) return fail('bad_request', 'Add a label so customers can pick this item.');
        const { error } = await admin.from('stock_items').insert({
          product_id: p.id, ciphertext: await encrypt(details), label: label || null,
          file_path: path, file_name: String(body.file_name ?? 'file').slice(0, 200),
        });
        if (error) return fail('server_error', errText(error));
        const stock = await recountStock(p.id);
        await log(profile.id, 'admin.add_stock_file', { product_id: p.id });
        return json({ ok: true, stock });
      }

      case 'order_note': {
        await admin.from('orders').update({ owner_note: String(body.note ?? '').trim().slice(0, 300) || null }).eq('id', body.order_id);
        await log(profile.id, 'admin.order_note', { order_id: body.order_id });
        return json({ ok: true });
      }

      case 'testlab_overdue': {
        const { data } = await admin.from('orders')
          .update({ due_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString() })
          .eq('status', 'processing').eq('delivery_type', 'manual').select('id');
        return json({ ok: true, count: data?.length ?? 0 });
      }

      case 'cron_register': {
        // gives the database timer the address and key it needs, once. Safe to call again.
        const { data: cur } = await admin.from('cron_config').select('secret').eq('id', 1).maybeSingle();
        const secret = cur?.secret ?? crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
        const { error } = await admin.from('cron_config').upsert({
          id: 1, url: SUPABASE_URL, anon_key: Deno.env.get('SUPABASE_ANON_KEY') ?? '', secret,
        }, { onConflict: 'id' });
        if (error) return fail('server_error', errText(error));
        return json({ ok: true });
      }

      case 'buy_number':
        return await buyNumber(profile, body);

      case 'sms_check': {
        const o = await smsOrderForUser(profile, String(body.order_id ?? ''));
        if (!o) return fail('not_found');
        await heroPollThrottled(); // one shared HeroSMS call every ~1.5s, however many customers are waiting
        return await smsStateResponse(o.id);
      }

      case 'sms_cancel': {
        const o = await smsOrderForUser(profile, String(body.order_id ?? ''));
        if (!o) return fail('not_found');
        let extra: Record<string, unknown> = {};
        if (o.status === 'processing') extra = { ...(await heroCancel(o)) };
        return await smsStateResponse(o.id, extra);
      }

      case 'sms_finish': { // the customer is done with the number: tell HeroSMS and stop listening
        const o = await smsOrderForUser(profile, String(body.order_id ?? ''));
        if (!o) return fail('not_found');
        if (o.status === 'completed' && o.hero_finished === false) await heroFinish(o);
        return await smsStateResponse(o.id);
      }

      case 'hero_sync': {
        try {
          const result = await heroSyncCatalog();
          await log(profile.id, 'admin.hero_sync', result);
          return json({ ok: true, ...result });
        } catch (e) {
          return fail('sync_failed', errText(e));
        }
      }

      case 'hero_profile': {
        const r = await heroLegacy('getBalance');
        const m = r.text.match(/ACCESS_BALANCE:\s*([0-9.]+)/);
        if (m) return json({ ok: true, balance: Number(m[1]) });
        return fail('hero_error', r.status === 0 ? r.text : `HeroSMS answered ${r.status}: ${r.text.slice(0, 120)}`);
      }

      case 'sms_sweep':
        return json({ ok: true, checked: await maybeSweepSms(true) });

      case 'get_shared': {
        const { data: c } = await admin.from('product_content').select('ciphertext').eq('product_id', body.product_id).maybeSingle();
        const { data: fl } = await admin.from('product_files').select('id, name').eq('product_id', body.product_id).order('id');
        return json({ ok: true, text: c ? await decrypt(c.ciphertext) : '', files: fl ?? [] });
      }

      case 'set_shared_text': {
        const { data: p } = await admin.from('products').select('id, delivery_type').eq('id', body.product_id).single();
        if (!p || p.delivery_type !== 'unlimited') return fail('bad_request', 'This product is not a same-for-everyone product.');
        const text = String(body.text ?? '').trim().slice(0, 5000);
        if (!text) {
          await admin.from('product_content').delete().eq('product_id', p.id);
        } else {
          const { error } = await admin.from('product_content')
            .upsert({ product_id: p.id, ciphertext: await encrypt(text), updated_at: new Date().toISOString() }, { onConflict: 'product_id' });
          if (error) return fail('server_error', errText(error));
        }
        await log(profile.id, 'admin.set_shared_text', { product_id: p.id });
        return json({ ok: true });
      }

      case 'add_shared_file': {
        const { data: p } = await admin.from('products').select('id, delivery_type').eq('id', body.product_id).single();
        if (!p || p.delivery_type !== 'unlimited') return fail('bad_request', 'This product is not a same-for-everyone product.');
        const path = String(body.file_path ?? '');
        if (!path.startsWith(`shared/${p.id}/`)) return fail('bad_request', 'Bad file path.');
        const { error } = await admin.from('product_files')
          .insert({ product_id: p.id, path, name: String(body.file_name ?? 'file').slice(0, 200) });
        if (error) return fail('server_error', errText(error));
        return json({ ok: true });
      }

      case 'remove_shared_file': {
        const { data: f } = await admin.from('product_files').select('id, path').eq('id', body.file_id).single();
        if (!f) return fail('not_found');
        await admin.from('product_files').delete().eq('id', f.id);
        // keep the file in storage if past buyers were given it
        const { count } = await admin.from('order_files').select('*', { count: 'exact', head: true }).eq('path', f.path);
        if (!count) await admin.storage.from('delivery-files').remove([f.path]);
        return json({ ok: true });
      }

      case 'list_stock': {
        const { data: rows } = await admin.from('stock_items')
          .select('id, label, ciphertext, status, order_id, file_name, created_at')
          .eq('product_id', body.product_id).order('id', { ascending: false }).limit(300);
        const items: unknown[] = [];
        for (const r of rows ?? []) {
          items.push({ id: r.id, label: r.label, status: r.status, order_id: r.order_id, file_name: r.file_name, details: await decrypt(r.ciphertext) });
        }
        return json({ ok: true, items });
      }

      case 'remove_stock_item': {
        const { data: it } = await admin.from('stock_items').select('id, product_id, status, file_path').eq('id', body.item_id).single();
        if (!it || it.status !== 'available') return fail('bad_request', 'Only unsold items can be removed.');
        if (it.file_path) await admin.storage.from('delivery-files').remove([it.file_path]);
        await admin.from('stock_items').delete().eq('id', it.id).eq('status', 'available');
        const stock = await recountStock(it.product_id);
        return json({ ok: true, stock });
      }

      case 'clear_stock': {
        const { data: old } = await admin.from('stock_items').select('file_path')
          .eq('product_id', body.product_id).eq('status', 'available').not('file_path', 'is', null);
        if (old && old.length) await admin.storage.from('delivery-files').remove(old.map((x: any) => x.file_path));
        await admin.from('stock_items').delete().eq('product_id', body.product_id).eq('status', 'available');
        const stock = await recountStock(Number(body.product_id));
        await log(profile.id, 'admin.clear_stock', { product_id: body.product_id });
        return json({ ok: true, stock });
      }

      default:
        return fail('bad_request', 'Unknown action.');
    }
  } catch (e) {
    console.error(e);
    return fail('server_error', 'Something went wrong.');
  }
});
