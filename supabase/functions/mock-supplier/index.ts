// PaBs Media — fake supplier that copies the real API contract, so the whole
// order flow can be tested without spending money.
// Deploy as an Edge Function named: mock-supplier
// Change its behaviour from the admin dashboard -> Test lab.
import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const CATEGORIES = [
  { id: 1, name: 'Facebook', slug: 'facebook' },
  { id: 2, name: 'Instagram', slug: 'instagram' },
  { id: 3, name: 'Tiktok', slug: 'tiktok' },
  { id: 4, name: 'Google Voice', slug: 'google-voice' },
  { id: 5, name: 'VPN', slug: 'vpn' },
];
const PRODUCTS = [
  { id: 128, name: 'Facebook 2025', category_id: 1, price: '3500.00', stock: 57 },
  { id: 129, name: 'USA Facebook Page Create', category_id: 1, price: '4200.00', stock: 12 },
  { id: 201, name: 'Instagram Aged Account', category_id: 2, price: '3000.00', stock: 30 },
  { id: 301, name: 'TikTok Followers 1k', category_id: 3, price: '1500.00', stock: 100 },
  { id: 401, name: 'New Google Voice', category_id: 4, price: '3990.00', stock: 16 },
  { id: 402, name: 'Old Google Voice', category_id: 4, price: '5500.00', stock: 4 },
  { id: 501, name: 'Express VPN 1 Month', category_id: 5, price: '1200.00', stock: 40 },
];

const out = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const err = (status: number, error: string, detail: string) => out(status, { error, detail });
const naira = (kobo: number) => (kobo / 100).toFixed(2);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (!req.headers.get('Authorization')) return err(401, 'unauthorized', 'Missing or invalid API key');
  const url = new URL(req.url);
  const route = url.pathname.replace(/^.*\/api\/v1/, '');
  const { data: st } = await db.from('mock_supplier').select('*').eq('id', 1).single();
  const scenario: string = st.scenario;

  if (scenario === 'bad_key') return err(401, 'unauthorized', 'Missing or invalid API key');
  if (scenario === 'rate_limit' && route === '/buy') return err(429, 'rate_limited', 'Rate limit exceeded');

  if (route === '/categories') return out(200, { count: CATEGORIES.length, results: CATEGORIES });

  if (route === '/products') {
    const cat = url.searchParams.get('category');
    let list = PRODUCTS.filter((p) => !cat || p.category_id === Number(cat));
    if (url.searchParams.get('in_stock') === 'true') list = list.filter((p) => p.stock > 0);
    return out(200, { count: list.length, results: list.map((p) => ({ ...p, in_stock: p.stock > 0 })) });
  }

  if (route === '/balance') return out(200, { balance: naira(st.balance_kobo), currency: 'NGN' });

  if (route === '/buy' && req.method === 'POST') {
    const { product, quantity = 1 } = await req.json();
    const p = PRODUCTS.find((x) => x.id === product);
    if (!p || scenario === 'not_found') return err(404, 'not_found', 'Product not found');
    if (scenario === 'out_of_stock' || p.stock < quantity) return err(409, 'out_of_stock', 'Not enough keys');
    const cost = Math.round(Number(p.price) * 100) * quantity;
    if (scenario === 'insufficient' || st.balance_kobo < cost) {
      return err(402, 'insufficient_balance', 'Wallet balance is too low for this order.');
    }

    if (scenario === 'server_error') return err(500, 'server_error', 'Internal error');
    if (scenario === 'timeout') { await sleep(40000); return err(504, 'timeout', 'Gateway timeout'); }

    // from here on the supplier charges us
    const orderId = st.next_order_id;
    await db.from('mock_supplier')
      .update({ balance_kobo: st.balance_kobo - cost, next_order_id: orderId + 1 }).eq('id', 1);

    if (scenario === 'charged_then_500') return err(500, 'server_error', 'Internal error after charge');
    if (scenario === 'charged_then_timeout') { await sleep(40000); return err(504, 'timeout', 'Gateway timeout'); }

    const keys = Array.from({ length: quantity }, () =>
      `MOCK-${p.id}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
    return out(201, { order_id: orderId, product: p.name, quantity, charge: naira(cost), keys });
  }

  return err(404, 'not_found', 'Unknown endpoint');
});
