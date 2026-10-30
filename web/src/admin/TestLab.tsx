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
