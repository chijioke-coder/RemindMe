import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { callApi, supabase } from '../lib/supabase';
import { dateTime, naira, STATUS_LABEL } from '../lib/format';

const roundUp500 = (kobo: number) => Math.ceil(kobo / 50000) * 50000; // next ₦500
const n0 = (kobo: number) => naira(Math.round(kobo / 100) * 100);

type Prod = { name: string; sell: number; cost: number };

/** Looks at every customer's wallet, works out what each one can buy, and says how much the supplier wallet needs. */
function FundingAdvice({ balanceKobo }: { balanceKobo: number | null }) {
  const [data, setData] = useState<{ prods: Prod[]; wallets: any[] } | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('products').select('display_name, upstream_name, sell_price_kobo, upstream_price_kobo')
        .eq('source', 'supplier').eq('is_active', true).eq('upstream_missing', false)
        .gt('stock', 0).gt('upstream_price_kobo', 0).gt('sell_price_kobo', 0),
      supabase.from('wallets').select('balance_kobo, profiles(email, role)').gt('balance_kobo', 0).limit(5000),
    ]).then(([p, w]) => setData({
      prods: (p.data ?? []).map((r: any) => ({ name: r.display_name || r.upstream_name, sell: Number(r.sell_price_kobo), cost: Number(r.upstream_price_kobo) })),
      wallets: w.data ?? [],
    }));
  }, [balanceKobo]);

  if (balanceKobo === null || !data || data.prods.length === 0) return null;

  // for each customer: the priciest-to-you product their wallet can afford (one purchase each)
  const rows = data.wallets
    .map((w: any) => {
      const pr = Array.isArray(w.profiles) ? w.profiles[0] : w.profiles;
      return { email: pr?.email ?? 'customer', role: pr?.role ?? 'customer', bal: Number(w.balance_kobo) };
    })
    .filter((c) => c.role !== 'admin')
    .map((c) => {
      let best: Prod | null = null;
      for (const p of data.prods) if (p.sell <= c.bal && (!best || p.cost > best.cost)) best = p;
      return { ...c, best };
    })
    .filter((r) => r.best) as { email: string; bal: number; best: Prod }[];

  const demand = rows.reduce((a, r) => a + r.best.cost, 0);
  const walletTotal = rows.reduce((a, r) => a + r.bal, 0);
  const recommended = roundUp500(Math.max(0, demand - balanceKobo));
  const top = [...rows].sort((a, b) => b.best.cost - a.best.cost).slice(0, 8);

  return (
    <div className="panel stack">
      <h2>How much to fund on the supplier site</h2>
      <p className="muted small">I checked every customer's wallet and what it can buy right now. A customer counts only if their wallet can afford at least one of your products.</p>

      {rows.length === 0 ? (
        <div className="notice good">Customer wallets are too low to buy anything right now, so there is nothing to fund.</div>
      ) : recommended === 0 ? (
        <div className="notice good">Your supplier wallet ({n0(balanceKobo)}) already covers what these customers could buy ({n0(demand)}). Nothing to add.</div>
      ) : (
        <div className="notice warn">
          Add about <b>{n0(recommended)}</b> on the supplier site. Then your wallet would be {n0(balanceKobo + recommended)}, enough for these customers to buy one product each.
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="stack-s">
            <div className="line-item"><span className="muted">Customers who can buy something</span><b>{rows.length}</b></div>
            <div className="line-item"><span className="muted">Money in those wallets</span><b>{n0(walletTotal)}</b></div>
            <div className="line-item"><span className="muted">Supplier cost if each buys one product</span><b>{n0(demand)}</b></div>
            <div className="line-item"><span className="muted">Your supplier wallet now</span><b>{n0(balanceKobo)}</b></div>
          </div>
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>See the customers behind this</summary>
            <div className="list" style={{ marginTop: 8, border: '1px solid var(--line)', borderRadius: 12 }}>
              {top.map((r, i) => (
                <div key={i} className="stack-s">
                  <div className="row between"><span style={{ fontWeight: 600 }}>{r.email}</span><span className="muted small">wallet {n0(r.bal)}</span></div>
                  <div className="muted small">Can afford {r.best.name}, which costs you {n0(r.best.cost)}</div>
                </div>
              ))}
              {rows.length > top.length && <div className="muted small">…and {rows.length - top.length} more customers.</div>}
            </div>
          </details>
          <p className="muted small">This counts one purchase per customer (the most expensive product, at your supplier price, that their wallet can afford). It updates whenever a wallet or your supplier balance changes.</p>
        </>
      )}
    </div>
  );
}

export default function Overview() {
  const [s, setS] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    const [a, b, c] = await Promise.all([
      supabase.rpc('admin_stats'),
      supabase.from('app_settings').select('*').eq('id', 1).single(),
      supabase.from('orders').select('id, product_name, quantity, total_kobo, status, created_at, profiles(email)')
        .order('created_at', { ascending: false }).limit(8),
    ]);
    setS(a.data);
    setSettings(b.data);
    setRecent(c.data ?? []);
  }
  const [cover, setCover] = useState<{ rows: any[] } | null>(null);
  useEffect(() => {
    void load();
    void callApi('cron_register'); // lets the 10-minute timer find this site (safe to repeat)
    supabase.from('products').select('upstream_price_kobo, stock').eq('source', 'supplier').eq('is_active', true).eq('upstream_missing', false)
      .then(({ data }) => setCover({ rows: data ?? [] }));
  }, []);

  async function checkBalance() {
    setBusy(true); setErr('');
    const r = await callApi('check_upstream');
    setBusy(false);
    if (!r.ok) setErr(r.detail || 'Could not reach the supplier.');
    await load();
  }

  if (!s) return <p className="muted">Loading…</p>;
  const profit = Number(s.revenue_kobo) - Number(s.cost_kobo);
  const max = Math.max(1, ...(s.daily ?? []).map((d: any) => Number(d.revenue_kobo)));

  return (
    <>
      {settings?.alert && <div className="notice warn"><b>Attention:</b> {settings.alert}</div>}
      {s.to_deliver > 0 && (
        <div className={`notice ${s.overdue > 0 ? 'bad' : 'warn'}`}>
          {s.to_deliver} paid order{s.to_deliver > 1 ? 's' : ''} waiting for you to deliver
          {s.overdue > 0 ? `, ${s.overdue} already overdue. Customers can see they are late and may contact support.` : '.'}{' '}
          <Link to="/admin/orders?status=to_deliver">Open</Link>
        </div>
      )}
      {s.needs_review > 0 && (
        <div className="notice bad">
          {s.needs_review} order{s.needs_review > 1 ? 's' : ''} need your review. The customer may have been charged on the supplier side. <Link to="/admin/orders?status=needs_review">Open</Link>
        </div>
      )}

      <div className="stats">
        <div className="stat"><div className="muted small">Sales (completed)</div><div className="v">{naira(s.revenue_kobo)}</div></div>
        <div className="stat"><div className="muted small">Profit</div><div className="v">{naira(profit)}</div></div>
        <div className="stat"><div className="muted small">Today</div><div className="v">{naira(s.today_revenue_kobo)}</div></div>
        <div className="stat"><div className="muted small">Customers</div><div className="v">{s.customers}</div></div>
        <div className="stat"><div className="muted small">Orders done</div><div className="v">{s.orders_completed}</div></div>
        <div className="stat"><div className="muted small">Failed or refunded</div><div className="v">{s.orders_failed}</div></div>
        <div className="stat"><div className="muted small">Customer wallets (owed)</div><div className="v">{naira(s.wallet_liability_kobo)}</div></div>
        <div className={`stat ${settings?.alert?.startsWith('Supplier') ? 'alert' : ''}`}>
          <div className="muted small">Supplier wallet</div>
          <div className="v">{settings?.upstream_balance_kobo != null ? naira(settings.upstream_balance_kobo) : '—'}</div>
          {settings?.upstream_balance_kobo != null && cover && (() => {
            const can = cover.rows.filter((r) => r.stock > 0 && r.upstream_price_kobo > 0 && r.upstream_price_kobo <= Number(settings.upstream_balance_kobo)).length;
            return <div className="muted small">Covers {can} of {cover.rows.length} products on sale</div>;
          })()}
          <button className="btn sm ghost" style={{ marginTop: 8 }} disabled={busy} onClick={checkBalance}>{busy ? 'Checking…' : 'Check now'}</button>
        </div>
      </div>
      {err && <div className="notice bad">{err}</div>}

      <FundingAdvice balanceKobo={settings?.upstream_balance_kobo != null ? Number(settings.upstream_balance_kobo) : null} />

      <div className="cols">
      <div className="panel stack">
        <h2>Sales, last 14 days</h2>
        <div className="bars">
          {(s.daily ?? []).map((d: any) => (
            <div key={d.day} title={`${d.day}: ${naira(d.revenue_kobo)}`}
              className={Number(d.revenue_kobo) === 0 ? 'zero' : ''}
              style={{ height: `${Math.max(2, (Number(d.revenue_kobo) / max) * 100)}%` }} />
          ))}
        </div>
      </div>

      <div className="panel flat">
        <div className="board-head">Latest orders</div>
        {recent.length === 0 ? <div className="empty">No orders yet.</div> : (
          <div className="list">
            {recent.map((o) => (
              <div className="row between" key={o.id}>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{o.product_name} × {o.quantity}</div>
                  <div className="muted small">{o.profiles?.email} · {dateTime(o.created_at)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700 }}>{naira(o.total_kobo)}</div>
                  <span className={`badge ${o.status}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </>
  );
}
