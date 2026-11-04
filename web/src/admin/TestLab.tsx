import { useEffect, useState } from 'react';
import { callApi, supabase } from '../lib/supabase';
import { naira } from '../lib/format';

const SCENARIOS: [string, string, string][] = [
  ['ok', 'Normal purchase', 'Supplier delivers keys. Expect: order completed, keys shown.'],
  ['insufficient', 'Supplier wallet empty (402)', 'Expect: customer refunded, purchases paused, alert shown.'],
  ['out_of_stock', 'Out of stock (409)', 'Expect: customer refunded, product stock set to 0.'],
  ['not_found', 'Product removed (404)', 'Expect: customer refunded, product hidden.'],
  ['rate_limit', 'Rate limited (429)', 'Expect: 3 retries, then customer refunded.'],
  ['bad_key', 'Bad API key (401)', 'Expect: customer refunded, purchases paused, alert shown.'],
  ['server_error', 'Supplier error, nothing charged (500)', 'Expect: balance check shows no charge, customer refunded automatically.'],
  ['timeout', 'Supplier hangs, nothing charged', 'Takes ~30s. Expect: automatic refund.'],
  ['charged_then_500', 'Charged, then error (500)', 'Expect: order marked Needs review. You resolve it in Orders.'],
  ['charged_then_timeout', 'Charged, then hangs', 'Takes ~30s. Expect: Needs review, no automatic refund.'],
];

export default function TestLab() {
  const [mock, setMock] = useState<any>(null);
  const [mode, setMode] = useState('mock');
  const [bal, setBal] = useState('');
  const [msg, setMsg] = useState('');
  const [seedMsg, setSeedMsg] = useState('');

  async function load() {
    const [m, s] = await Promise.all([
      supabase.from('mock_supplier').select('*').eq('id', 1).single(),
      supabase.from('app_settings').select('supplier_mode').eq('id', 1).single(),
    ]);
    setMock(m.data); setMode(s.data?.supplier_mode ?? 'mock'); setBal(String((m.data?.balance_kobo ?? 0) / 100));
  }
  useEffect(() => { void load(); }, []);
  if (!mock) return <p className="muted">Loading…</p>;

  async function setScenario(v: string) {
    await supabase.from('mock_supplier').update({ scenario: v }).eq('id', 1);
    await load();
  }
  async function saveBal() {
    await supabase.from('mock_supplier').update({ balance_kobo: Math.round(Number(bal) * 100) }).eq('id', 1);
    await load();
  }
  async function setSupplier(v: string) {
    if (v === 'live' && !confirm('Switch to the LIVE supplier? Real money will be spent on every order.')) return;
    await supabase.from('app_settings').update({ supplier_mode: v }).eq('id', 1);
    await load();
  }
  async function seedSamples() {
    setSeedMsg('Creating sample products…');
    const { data: existing } = await supabase.from('products').select('id').like('upstream_name', 'TEST %');
    if (existing && existing.length) return setSeedMsg('Sample products already exist. Remove them first to create fresh ones.');
    const a = await supabase.from('products').insert({
      source: 'own', delivery_type: 'stock', track_stock: true, pick_items: true, upstream_product_id: null,
      upstream_name: 'TEST Facebook Page (choose yours)', price_override_kobo: 150000, upstream_price_kobo: 100000,
      description: 'Sample unique stock. Every page is different and you pick the one you want.', badge: 'Test', is_active: true, stock: 0,
    }).select('id').single();
    if (a.error || !a.data) return setSeedMsg(a.error?.message ?? 'Could not create the stock sample.');
    const items = [1, 2, 3, 4, 5].map((n) => `TEST-PAGE-00${n} ## login: demo${n}@example.com / pass: demo-${n}`);
    const r = await callApi<any>('add_stock', { product_id: a.data.id, items });
    if (!r.ok) return setSeedMsg(r.detail || 'Could not add the sample stock.');
    const b = await supabase.from('products').insert({
      source: 'own', delivery_type: 'manual', track_stock: false, upstream_product_id: null,
      upstream_name: 'TEST TikTok followers (delivered by you)', price_override_kobo: 100000, upstream_price_kobo: 60000,
      description: 'Sample service that you deliver by hand.', input_label: 'Your TikTok username',
      delivery_note: 'Please do not change your username until delivery.', delivery_hours: 1, badge: 'Test', is_active: true, stock: 0,
    }).select('id').single();
    if (b.error) return setSeedMsg(b.error.message);
    setSeedMsg('Created 2 sample products: a stock product with 5 unique pickable items, and a service you deliver by hand. Find them in the store.');
  }
  async function removeSamples() {
    const { data } = await supabase.from('products').select('id').like('upstream_name', 'TEST %');
    let hidden = 0;
    for (const p of data ?? []) {
      const { error } = await supabase.from('products').delete().eq('id', p.id);
      if (error) { await supabase.from('products').update({ is_active: false }).eq('id', p.id); hidden++; }
    }
    setSeedMsg(hidden ? `Samples removed. ${hidden} had orders, so they were hidden instead.` : 'Sample products removed.');
  }
  async function makeOverdue() {
    const r = await callApi<any>('testlab_overdue');
    setSeedMsg(r.ok ? `${r.count} waiting delivery order(s) now show as 3 hours late.` : (r.detail || 'Failed'));
  }
  async function sync() {
    setMsg('Syncing…');
    const r = await callApi<any>('sync_products');
    setMsg(r.ok ? `Synced ${r.products} products (${r.added} new). Switch the ones you want on in Products.` : (r.detail || 'Sync failed'));
  }

  return (
    <>
      <h1 style={{ fontSize: '1.8rem' }}>Test lab</h1>
      <div className={`notice ${mode === 'live' ? 'bad' : 'good'}`}>
        Supplier mode: <b>{mode === 'live' ? 'LIVE (real money)' : 'MOCK (safe, fake supplier)'}</b>
      </div>

      <div className="panel stack">
        <h2>How to test</h2>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>Keep supplier mode on <b>Mock</b>, then tap Sync below.</li>
          <li>In Products, switch a few products on.</li>
          <li>In Customers, add test money to your own account.</li>
          <li>Pick a scenario here, then buy from the store and compare with “Expect”.</li>
        </ol>
        <button className="btn" onClick={sync}>Sync catalogue from supplier</button>
        {msg && <p className="muted small">{msg}</p>}
      </div>

      <div className="panel stack">
        <h2>Mock supplier behaviour</h2>
        <div className="stack-s">
          {SCENARIOS.map(([v, label, expect]) => (
            <label key={v} className="row" style={{ alignItems: 'flex-start', padding: 8, borderRadius: 10, background: mock.scenario === v ? 'var(--teal-l)' : 'transparent' }}>
              <input type="radio" name="sc" checked={mock.scenario === v} onChange={() => setScenario(v)} style={{ marginTop: 5, accentColor: 'var(--teal)' }} />
              <span><b>{label}</b><div className="muted small">{expect}</div></span>
            </label>
          ))}
        </div>
        <div className="row">
          <label className="f grow"><span>Mock supplier balance (₦)</span><input className="in" inputMode="numeric" value={bal} onChange={(e) => setBal(e.target.value)} /></label>
          <button className="btn" style={{ marginTop: 22 }} onClick={saveBal}>Set</button>
        </div>
        <p className="muted small">Current mock balance: {naira(mock.balance_kobo)}</p>
      </div>

      <div className="panel stack">
        <h2>Your own products and deliveries</h2>
        <div className="row wrap">
          <button className="btn" onClick={seedSamples}>Create sample products</button>
          <button className="btn ghost" onClick={removeSamples}>Remove samples</button>
          <button className="btn ghost" onClick={makeOverdue}>Make waiting deliveries late</button>
        </div>
        {seedMsg && <div className="notice good small">{seedMsg}</div>}
        <ol style={{ margin: 0, paddingLeft: 20 }} className="stack-s">
          <li><b>Pick from a list:</b> in the store open “TEST Facebook Page”, tick two pages, buy. Both logins should appear. Buy again: those two must be gone from the list.</li>
          <li><b>Sold out:</b> buy until the pages run out. The product should show “Sold out”, and other products must not change.</li>
          <li><b>Stock with a file:</b> Products → Add stock → “One item with a file”, upload a small image or .zip, buy it, then check the Download button works.</li>
          <li><b>Deliver by hand:</b> buy “TEST TikTok followers” with a username. Open Orders → To deliver, write a message, attach a file, tap Deliver. Check the customer’s Orders shows it.</li>
          <li><b>Late delivery:</b> buy the service again, tap “Make waiting deliveries late”, then open the customer’s Orders. It should show the late notice and a Contact support button. Test “Send update” and “Refund customer” on it.</li>
          <li><b>Icons:</b> Products → Edit → upload an icon, replace it, remove it. Check the store shows each change.</li>
        </ol>
        <p className="muted small">Contact support needs a WhatsApp number saved in Settings.</p>
      </div>

      <div className="panel stack">
        <h2>Real supplier</h2>
        <p className="muted small">Only switch after every scenario above behaves correctly and UPSTREAM_API_KEY is set in the function secrets. Then make one small real purchase first.</p>
        <div className="row">
          <button className={`btn grow ${mode === 'mock' ? '' : 'ghost'}`} onClick={() => setSupplier('mock')}>Use mock</button>
          <button className={`btn grow ${mode === 'live' ? 'danger' : 'ghost'}`} onClick={() => setSupplier('live')}>Use live</button>
        </div>
      </div>
    </>
  );
}
