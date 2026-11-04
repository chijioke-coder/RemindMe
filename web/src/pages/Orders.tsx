import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { dateTime, naira, STATUS_LABEL } from '../lib/format';
import KeyList from '../components/KeyList';

type Order = {
  id: string; product_name: string; quantity: number; total_kobo: number; status: string; created_at: string;
  customer_note: string | null; delivery_type: string; due_at: string | null; owner_note: string | null;
};

function Timeline({ done }: { done: boolean }) {
  return (
    <div className="timeline">
      <span className="on">Paid</span>
      <span className={done ? 'on' : 'now'}>Preparing</span>
      <span className={done ? 'on' : ''}>Delivered</span>
    </div>
  );
}

export default function Orders() {
  const { settings } = useAuth();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const wa = settings?.support_whatsapp?.replace(/\D/g, '');

  useEffect(() => {
    const load = () => supabase.from('my_orders').select('*').order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => setOrders((data ?? []) as Order[]));
    void load();
    const timer = setInterval(load, 10000); // pick up deliveries without a reload
    return () => clearInterval(timer);
  }, []);

  const support = (o: Order) =>
    wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Hello, I need help with my order ${o.id.slice(0, 8)} (${o.product_name}) placed on ${dateTime(o.created_at)}.`)}` : null;

  return (
    <>
      <h1 style={{ fontSize: '2rem' }}>Your orders</h1>
      {orders === null ? <p className="muted">Loading…</p> : orders.length === 0 ? (
        <div className="panel empty">You have not bought anything yet.</div>
      ) : (
        <div className="panel flat list">
          {orders.map((o) => {
            const overdue = o.status === 'processing' && !!o.due_at && new Date(o.due_at) < new Date();
            const link = support(o);
            return (
              <div key={o.id} className="stack-s">
                <div className="row between">
                  <div className="grow">
                    <div style={{ fontWeight: 700 }}>{o.product_name} × {o.quantity}</div>
                    <div className="muted small">{dateTime(o.created_at)} · Order {o.id.slice(0, 8)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700 }}>{naira(o.total_kobo)}</div>
                    <span className={`badge ${o.status}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
                  </div>
                </div>

                {o.customer_note && <p className="muted small">Your details: {o.customer_note}</p>}

                {o.status === 'completed' && (
                  open === o.id ? <KeyList orderId={o.id} autoLoad /> : <button className="btn sm ghost" onClick={() => setOpen(o.id)}>View details</button>
                )}

                {o.status === 'processing' && (
                  <div className="stack-s">
                    {o.delivery_type === 'manual' && <Timeline done={false} />}
                    <p className="muted small">
                      {o.delivery_type === 'manual'
                        ? `We are preparing this order by hand.${o.due_at ? ` Expected by ${dateTime(o.due_at)}.` : ''} It will appear here as soon as it is delivered.`
                        : 'Still being processed. This page will show the result when ready.'}
                    </p>
                    {o.owner_note && <div className="notice warn small"><b>Update from us:</b> {o.owner_note}</div>}
                    {overdue && <div className="notice bad small">This is taking longer than promised. We are sorry. Please contact support and we will sort it out.</div>}
                    {link && <a className={`btn sm ${overdue ? 'gold' : 'ghost'}`} href={link} target="_blank" rel="noreferrer">Contact support</a>}
                  </div>
                )}

                {(o.status === 'failed' || o.status === 'refunded') && (
                  <div className="stack-s">
                    <p className="muted small">The amount was returned to your wallet.</p>
                    {o.owner_note && <div className="notice warn small">{o.owner_note}</div>}
                    {link && <a className="btn sm ghost" href={link} target="_blank" rel="noreferrer">Contact support</a>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
