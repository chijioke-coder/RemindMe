import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { callApi, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { dateTime, naira, STATUS_LABEL } from '../lib/format';
import KeyList from '../components/KeyList';
import Icon from '../components/Icon';
import Linkify from '../components/Linkify';

type Order = {
  id: string; product_name: string; quantity: number; unit_price_kobo: number; total_kobo: number; status: string;
  created_at: string; completed_at: string | null; customer_note: string | null; delivery_type: string;
  due_at: string | null; owner_note: string | null; after_message: string | null;
  sms_phone: string | null; sms_expires: string | null;
};

export default function OrderDetail() {
  const { id } = useParams();
  const { settings } = useAuth();
  const loc = useLocation();
  const reason = (loc.state as { reason?: string | null } | null)?.reason ?? null;
  const [o, setO] = useState<Order | null | undefined>(undefined);
  const status = o?.status;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase.from('my_orders').select('*').eq('id', id).maybeSingle();
      if (alive) setO((data as Order | null) ?? null);
    };
    void load();
    const timer = status === undefined || status === 'processing' ? setInterval(load, 5000) : undefined;
    return () => { alive = false; if (timer) clearInterval(timer); };
  }, [id, status]);

  // virtual number orders: ask 5sim for the code every few seconds while waiting
  const isSms = o?.delivery_type === 'sms';
  const [now, setNow] = useState(() => Date.now());
  const [busyCancel, setBusyCancel] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!(isSms && status === 'processing')) return;
    const poll = () => { void callApi('sms_check', { order_id: id }); };
    poll();
    const t = setInterval(poll, 4000);
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(t); clearInterval(c); };
  }, [id, isSms, status]);

  async function cancelNumber() {
    if (!confirm('Cancel this number and get your money back? You can only cancel before a code arrives.')) return;
    setBusyCancel(true);
    await callApi('sms_cancel', { order_id: id });
    setBusyCancel(false);
    const { data } = await supabase.from('my_orders').select('*').eq('id', id).maybeSingle();
    if (data) setO(data as Order);
  }

  if (o === undefined) return <p className="muted">Loading your order…</p>;
  if (o === null) {
    return (
      <div className="panel result">
        <div className="result-icon bad"><Icon name="alert" size={36} /></div>
        <h1>Order not found</h1>
        <p className="muted">We could not find that order on your account.</p>
        <Link to="/orders" className="btn">Go to my orders</Link>
      </div>
    );
  }

  const wa = settings?.support_whatsapp?.replace(/\D/g, '');
  const support = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Hello, I need help with my order ${o.id.slice(0, 8)} (${o.product_name}) placed on ${dateTime(o.created_at)}.`)}` : null;
  const done = o.status === 'completed';
  const waiting = o.status === 'processing';
  const overdue = waiting && !!o.due_at && new Date(o.due_at) < new Date();
  const state = done ? 'ok' : waiting ? 'wait' : 'bad';

  const title = done ? 'Order complete'
    : waiting ? (o.delivery_type === 'manual' ? 'Order received' : o.delivery_type === 'sms' ? 'Your number is ready' : 'Order in progress')
    : reason === 'items_taken' ? 'Someone got there first' : 'We could not complete this order';
  const sub = done ? 'Your purchase is ready. Everything you bought is shown here and saved in your orders.'
    : waiting ? (o.delivery_type === 'manual' ? 'Thank you. We are preparing your order by hand and it will appear on this page as soon as it is delivered.' : o.delivery_type === 'sms' ? 'Use the number below on the app, then ask it to send the code. The code shows here the moment it arrives.' : 'This usually takes a moment. This page updates by itself.')
    : reason === 'items_taken' ? `Another buyer picked one of those items just before you. Your ${naira(o.total_kobo)} is back in your wallet, so you can choose again.`
    : `Your ${naira(o.total_kobo)} has been returned to your wallet. You can try again or contact support.`;

  return (
    <>
      <div className="result">
        <div className={`result-icon ${state}`}><Icon name={done ? 'check' : waiting ? 'clock' : 'alert'} size={38} /></div>
        <h1>{title}</h1>
        <p className="muted">{sub}</p>
      </div>

      <div className="cols wide-left">
        <div className="stack">
          {o.after_message && (done || waiting) && (
            <div className="note-card">
              <h3>A note from the seller</h3>
              <p style={{ whiteSpace: 'pre-wrap' }}><Linkify text={o.after_message} /></p>
            </div>
          )}

          {done && (
            <div className="panel stack">
              <h2>Your details</h2>
              <KeyList orderId={o.id} autoLoad />
            </div>
          )}

          {waiting && isSms && (
            <div className="panel stack">
              <h2>Your number</h2>
              {o.sms_phone ? (
                <div className="keybox">
                  <span className="mono" style={{ fontSize: '1.4rem', fontWeight: 700 }}>{o.sms_phone}</span>
                  <button className="btn sm gold" onClick={async () => { try { await navigator.clipboard.writeText(o.sms_phone ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } }}>{copied ? 'Copied' : 'Copy'}</button>
                </div>
              ) : <p className="muted">Getting your number…</p>}
              <div className="notice warn">
                Waiting for the SMS…
                {o.sms_expires && (() => {
                  const left = Math.max(0, Math.floor((new Date(o.sms_expires).getTime() - now) / 1000));
                  return <> <b>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</b> left. If no code arrives in time, you are refunded automatically.</>;
                })()}
              </div>
              <button className="btn ghost" disabled={busyCancel} onClick={cancelNumber}>{busyCancel ? 'Cancelling…' : 'Cancel and refund me'}</button>
              {support && <a className="btn ghost" href={support} target="_blank" rel="noreferrer">Contact support</a>}
            </div>
          )}

          {waiting && !isSms && (
            <div className="panel stack">
              <h2>Progress</h2>
              {o.delivery_type === 'manual' && (
                <div className="timeline"><span className="on">Paid</span><span className="now">Preparing</span><span>Delivered</span></div>
              )}
              {o.due_at && <p className="muted">Expected by <b>{dateTime(o.due_at)}</b>.</p>}
              {o.owner_note && <div className="notice warn"><b>Update from us:</b> <Linkify text={o.owner_note} /></div>}
              {overdue && <div className="notice bad">This is taking longer than promised, and we are sorry. Please contact support and we will sort it out.</div>}
              {support && <a className={`btn ${overdue ? 'gold' : 'ghost'}`} href={support} target="_blank" rel="noreferrer">Contact support</a>}
            </div>
          )}

          {!done && !waiting && o.owner_note && <div className="notice warn">{o.owner_note}</div>}
        </div>

        <div className="stack">
          <div className="panel stack-s">
            <h2>Receipt</h2>
            <div className="line-item"><span className="muted">Product</span><b>{o.product_name}</b></div>
            <div className="line-item"><span className="muted">Quantity</span><span>{o.quantity}</span></div>
            <div className="line-item"><span className="muted">Price each</span><span>{naira(o.unit_price_kobo)}</span></div>
            <div className="line-item total"><span>Total</span><span>{naira(o.total_kobo)}</span></div>
            <div className="line-item"><span className="muted">Status</span><span className={`badge ${o.status}`}>{STATUS_LABEL[o.status] ?? o.status}</span></div>
            <div className="line-item"><span className="muted">Placed</span><span>{dateTime(o.created_at)}</span></div>
            <div className="line-item"><span className="muted">Order number</span><span className="mono">{o.id.slice(0, 8)}</span></div>
            {o.customer_note && <div className="line-item"><span className="muted">Your details</span><span>{o.customer_note}</span></div>}
          </div>
          <div className="row wrap">
            <Link to="/products" className="btn">{done ? 'Buy something else' : 'Back to the store'}</Link>
            <Link to="/orders" className="btn ghost">All my orders</Link>
            {support && !waiting && <a className="btn ghost" href={support} target="_blank" rel="noreferrer">Contact support</a>}
          </div>
        </div>
      </div>
    </>
  );
}
