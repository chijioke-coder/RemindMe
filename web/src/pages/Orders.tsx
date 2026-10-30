import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { dateTime, naira, STATUS_LABEL } from '../lib/format';
import KeyList from '../components/KeyList';

type Order = { id: string; product_name: string; quantity: number; total_kobo: number; status: string; created_at: string };

export default function Orders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('my_orders').select('*').order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => setOrders((data ?? []) as Order[]));
  }, []);

  return (
    <>
      <h1 style={{ fontSize: '2rem' }}>Your orders</h1>
      {orders === null ? <p className="muted">Loading…</p> : orders.length === 0 ? (
        <div className="panel empty">You have not bought anything yet.</div>
      ) : (
        <div className="panel flat list">
          {orders.map((o) => (
            <div key={o.id} className="stack-s">
              <div className="row between">
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{o.product_name} × {o.quantity}</div>
                  <div className="muted small">{dateTime(o.created_at)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700 }}>{naira(o.total_kobo)}</div>
                  <span className={`badge ${o.status}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
                </div>
              </div>
              {o.status === 'completed' && (
                open === o.id ? <KeyList orderId={o.id} autoLoad /> : <button className="btn sm ghost" onClick={() => setOpen(o.id)}>View details</button>
              )}
              {o.status === 'processing' && <p className="muted small">Still being processed. This page will show the result when ready.</p>}
              {(o.status === 'failed' || o.status === 'refunded') && <p className="muted small">The amount was returned to your wallet.</p>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
