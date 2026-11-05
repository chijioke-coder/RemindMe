import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { dateTime, naira, STATUS_LABEL } from '../lib/format';

type Order = {
  id: string; product_name: string; quantity: number; total_kobo: number; status: string; created_at: string;
  delivery_type: string; due_at: string | null;
};

export default function Orders() {
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    const load = () => supabase.from('my_orders').select('*').order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => setOrders((data ?? []) as Order[]));
    void load();
    const timer = setInterval(load, 10000); // pick up deliveries without a reload
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <h1 style={{ fontSize: 'clamp(1.6rem, 5vw, 2.2rem)' }}>Your orders</h1>
      {orders === null ? <p className="muted">Loading…</p> : orders.length === 0 ? (
        <div className="panel empty">You have not bought anything yet. <Link to="/products">Browse the store</Link></div>
      ) : (
        <div className="panel flat list">
          {orders.map((o) => {
            const overdue = o.status === 'processing' && !!o.due_at && new Date(o.due_at) < new Date();
            return (
              <Link key={o.id} to={`/orders/${o.id}`} className="row between" style={{ color: 'inherit' }}>
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{o.product_name} × {o.quantity}</div>
                  <div className="muted small">{dateTime(o.created_at)} · {o.id.slice(0, 8)}</div>
                  {overdue && <span className="badge failed">Running late</span>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700 }}>{naira(o.total_kobo)}</div>
                  <span className={`badge ${o.status}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
