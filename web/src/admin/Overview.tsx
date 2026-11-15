import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { callApi, supabase } from '../lib/supabase';
import { dateTime, naira, STATUS_LABEL } from '../lib/format';

const roundUp500 = (kobo: number) => Math.ceil(kobo / 50000) * 50000; // next ₦500

/** Works out how much to add on the supplier site, from your real products and recent orders. */
function FundingAdvice({ balanceKobo }: { balanceKobo: number | null }) {
  const [d, setD] = useState<{ cheapest: number; priciest: number; daily: number; missed: number; count: number } | null>(null);

  useEffect(() => {
    const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
    const since1 = new Date(Date.now() - 86400000).toISOString();
    Promise.all([
      supabase.from('products').select('upstream_price_kobo').eq('source', 'supplier').eq('is_active', true)
        .eq('upstream_missing', false).gt('stock', 0).gt('upstream_price_kobo', 0),
      supabase.from('orders').select('upstream_charge_kobo').eq('status', 'completed').eq('delivery_type', 'supplier').gte('created_at', since7),
      supabase.from('orders').select('upstream_unit_cost_kobo, quantity').eq('error_code', 'upstream_balance').gte('created_at', since1),
    ]).then(([p, done, missed]) => {
      const prices = (p.data ?? []).map((r: any) => Number(r.upstream_price_kobo));
      const spent7 = (done.data ?? []).reduce((a: number, r: any) => a + Number(r.upstream_charge_kobo ?? 0), 0);
      const missed24 = (missed.data ?? []).reduce((a: number, r: any) => a + Number(r.upstream_unit_cost_kobo ?? 0) * Number(r.quantity ?? 1), 0);
      setD({
        cheapest: prices.length ? Math.min(...prices) : 0,
        priciest: prices.length ? Math.max(...prices) : 0,
        daily: spent7 / 7,
        missed: missed24,
        count: prices.length,
      });
    });
  }, [balanceKobo]);

  if (balanceKobo === null || !d) return null;
  if (d.count === 0) return null;

  const resume = Math.max(0, d.cheapest - balanceKobo);
  const everyOnce = Math.max(0, d.priciest - balanceKobo);
  const target = Math.max(d.priciest, 3 * d.daily, d.missed);
  const recommended = roundUp500(Math.max(0, target - balanceKobo));
  const fine = recommended === 0;

  return (
    <div className={`panel stack ${fine ? '' : ''}`}>
      <h2>How much to fund on the supplier site</h2>
      {fine ? (
        <div className="notice good">Your supplier wallet ({naira(balanceKobo)}) is enough for now. Nothing to add.</div>
      ) : (
        <div className="notice warn">
          Add about <b>{naira(recommended)}</b> on the supplier site. After that your wallet would be {naira(balanceKobo + recommended)}.
        </div>
      )}
      <div className="stack-s">
        <div className="line-item"><span className="muted">Your supplier wallet now</span><b>{naira(balanceKobo)}</b></div>
        <div className="line-item"><span className="muted">Smallest top-up to sell the cheapest product</span><b>{resume > 0 ? naira(resume) : 'Not needed'}</b></div>
        <div className="line-item"><span className="muted">To be able to buy any single product once</span><b>{everyOnce > 0 ? naira(everyOnce) : 'Not needed'}</b></div>
        <div className="line-item"><span className="muted">Recommended top-up</span><b>{recommended > 0 ? naira(recommended) : 'Not needed'}</b></div>
      </div>
      <p className="muted small">
        The recommendation covers the most expensive product you sell ({naira(d.priciest)}), about 3 days of your recent supplier spending ({naira(Math.round(3 * d.daily))}),
        and customers whose orders could not go through in the last 24 hours ({naira(d.missed)}), whichever is biggest. It updates each time your supplier balance is checked.
      </p>
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
