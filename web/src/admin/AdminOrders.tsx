import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { callApi, supabase } from '../lib/supabase';
import { dateTime, naira, STATUS_LABEL } from '../lib/format';

export default function AdminOrders() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const [orders, setOrders] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [keys, setKeys] = useState('');
  const [supOrder, setSupOrder] = useState('');
  const [charge, setCharge] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    let q = supabase.from('orders').select('*, profiles(email)').order('created_at', { ascending: false }).limit(150);
    if (status) q = q.eq('status', status);
    const { data } = await q;
    setOrders(data ?? []);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [status]);

  async function resolve(o: any, resolution: 'refund' | 'complete') {
    setMsg('');
    if (resolution === 'refund' && !confirm('Refund this customer to their wallet?')) return;
    const r = await callApi('resolve_order', {
      order_id: o.id, resolution, keys: keys.split('\n'), upstream_order_id: supOrder, charge_naira: charge,
    });
    if (!r.ok) return setMsg(r.detail || 'Could not resolve.');
    setOpen(null); setKeys(''); setSupOrder(''); setCharge('');
    await load();
  }

  return (
    <>
      <h1 style={{ fontSize: '1.8rem' }}>Orders</h1>
      <div className="chips">
        {[['', 'All'], ['needs_review', 'Needs review'], ['processing', 'Processing'], ['completed', 'Completed'], ['failed', 'Failed'], ['refunded', 'Refunded']].map(([v, l]) => (
          <button key={v} className={`chip ${status === v ? 'on' : ''}`} onClick={() => setParams(v ? { status: v } : {})}>{l}</button>
        ))}
      </div>
      {msg && <div className="notice bad">{msg}</div>}
      <div className="panel flat list">
        {orders.map((o) => {
          const cost = o.upstream_charge_kobo;
          return (
            <div key={o.id} className="stack-s">
              <div className="row between" onClick={() => setOpen(open === o.id ? null : o.id)} style={{ cursor: 'pointer' }}>
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{o.product_name} × {o.quantity}</div>
                  <div className="muted small">{o.profiles?.email} · {dateTime(o.created_at)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700 }}>{naira(o.total_kobo)}</div>
                  <span className={`badge ${o.status}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
                </div>
              </div>
              {open === o.id && (
                <div className="stack-s">
                  <div className="muted small">
                    Order {o.id.slice(0, 8)} · Supplier order {o.upstream_order_id ?? '—'} · Cost {cost != null ? naira(cost) : '—'}
                    {cost != null && ` · Profit ${naira(o.total_kobo - cost)}`}
                  </div>
                  {o.error_code && <div className="notice warn"><b>{o.error_code}</b>{o.error_detail ? `: ${o.error_detail}` : ''}</div>}
                  {o.flag && <div className="notice warn">Flag: {o.flag}</div>}
                  {o.status === 'needs_review' && (
                    <div className="panel stack">
                      <h3>Resolve this order</h3>
                      <p className="muted small">Check the supplier&apos;s order history. If they charged you, paste the keys to deliver. If not, refund the customer.</p>
                      <label className="f"><span>Keys (one per line)</span><textarea className="in" value={keys} onChange={(e) => setKeys(e.target.value)} /></label>
                      <div className="grid2">
                        <label className="f"><span>Supplier order ID (optional)</span><input className="in" inputMode="numeric" value={supOrder} onChange={(e) => setSupOrder(e.target.value)} /></label>
                        <label className="f"><span>Supplier charge ₦ (optional)</span><input className="in" inputMode="decimal" value={charge} onChange={(e) => setCharge(e.target.value)} /></label>
                      </div>
                      <div className="row wrap">
                        <button className="btn" disabled={!keys.trim()} onClick={() => resolve(o, 'complete')}>Deliver keys</button>
                        <button className="btn danger" onClick={() => resolve(o, 'refund')}>Refund customer</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {orders.length === 0 && <div className="empty">No orders match.</div>}
      </div>
    </>
  );
}
