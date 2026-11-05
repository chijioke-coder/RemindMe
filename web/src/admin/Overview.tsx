import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { callApi, supabase } from '../lib/supabase';
import { dateTime, naira, STATUS_LABEL } from '../lib/format';

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
  useEffect(() => { void load(); }, []);

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
        <div className={`stat ${settings && settings.upstream_balance_kobo != null && settings.upstream_balance_kobo < settings.low_balance_threshold_kobo ? 'alert' : ''}`}>
          <div className="muted small">Supplier wallet</div>
          <div className="v">{settings?.upstream_balance_kobo != null ? naira(settings.upstream_balance_kobo) : '—'}</div>
          <button className="btn sm ghost" style={{ marginTop: 8 }} disabled={busy} onClick={checkBalance}>{busy ? 'Checking…' : 'Check now'}</button>
        </div>
      </div>
      {err && <div className="notice bad">{err}</div>}

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
