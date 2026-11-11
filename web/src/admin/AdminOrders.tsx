import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { callApi, supabase } from '../lib/supabase';
import { safeName } from '../lib/images';
import { dateTime, naira, STATUS_LABEL } from '../lib/format';

const CHIPS: [string, string][] = [
  ['', 'All'], ['to_deliver', 'To deliver'], ['needs_review', 'Needs review'], ['processing', 'Processing'],
  ['completed', 'Completed'], ['failed', 'Failed'], ['refunded', 'Refunded'],
];

function lateLabel(dueAt: string | null) {
  if (!dueAt) return null;
  const ms = Date.now() - new Date(dueAt).getTime();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  return h >= 1 ? `Overdue by ${h}h` : `Overdue by ${Math.max(1, Math.floor(ms / 60000))} min`;
}

function DeliverPanel({ order, onDone }: { order: any; onDone: () => void }) {
  const manual = order.delivery_type === 'manual';
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [supOrder, setSupOrder] = useState('');
  const [charge, setCharge] = useState('');
  const [note, setNote] = useState(order.owner_note ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);

  async function deliver() {
    setBusy(true);
    setMsg(null);
    const uploaded: string[] = [];
    try {
      const sent: { path: string; name: string }[] = [];
      for (const f of files) {
        const path = `orders/${order.id}/${crypto.randomUUID()}-${safeName(f.name)}`;
        const up = await supabase.storage.from('delivery-files').upload(path, f, { contentType: f.type || undefined });
        if (up.error) throw new Error(`Could not upload ${f.name}: ${up.error.message}`);
        uploaded.push(path);
        sent.push({ path, name: f.name });
      }
      const r = await callApi('resolve_order', {
        order_id: order.id, resolution: 'complete', keys: text.split('\n'), files: sent,
        upstream_order_id: supOrder, charge_naira: charge,
      });
      if (!r.ok) throw new Error(r.detail || 'Could not deliver.');
      onDone();
    } catch (e: any) {
      if (uploaded.length) await supabase.storage.from('delivery-files').remove(uploaded);
      setMsg({ kind: 'bad', text: e?.message ?? 'Delivery failed. Nothing was sent to the customer.' });
    }
    setBusy(false);
  }

  async function refund() {
    if (!confirm('Refund this customer to their wallet? This cannot be undone.')) return;
    setBusy(true);
    const r = await callApi('resolve_order', { order_id: order.id, resolution: 'refund', note });
    setBusy(false);
    if (!r.ok) return setMsg({ kind: 'bad', text: r.detail || 'Could not refund.' });
    onDone();
  }

  async function sendNote() {
    setBusy(true);
    const r = await callApi('order_note', { order_id: order.id, note });
    setBusy(false);
    setMsg(r.ok ? { kind: 'good', text: note.trim() ? 'Update sent. The customer sees it in their Orders.' : 'Update cleared.' } : { kind: 'bad', text: r.detail || 'Could not save.' });
  }

  return (
    <div className="panel stack">
      <h3>{manual ? 'Deliver this order' : 'Resolve this order'}</h3>
      <p className="muted small">
        {manual
          ? 'Type what the customer should receive (a message, logins or links, one per line) and attach any files. It appears in their Orders straight away.'
          : "Check the supplier's order history. If they charged you, paste the keys to deliver. If not, refund the customer."}
      </p>
      <label className="f"><span>{manual ? 'Message, links or details (one per line)' : 'Keys (one per line)'}</span>
        <textarea className="in" style={{ minHeight: 110 }} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} /></label>
      {manual && (
        <>
          <label className="f"><span>Files (optional, up to 50 MB each)</span>
            <input className="in" type="file" multiple disabled={busy} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></label>
          {files.length > 0 && <p className="muted small">{files.map((f) => `${f.name} (${(f.size / 1048576).toFixed(1)} MB)`).join(' · ')}</p>}
        </>
      )}
      {!manual && (
        <div className="grid2">
          <label className="f"><span>Supplier order ID (optional)</span><input className="in" inputMode="numeric" value={supOrder} onChange={(e) => setSupOrder(e.target.value)} /></label>
          <label className="f"><span>Supplier charge ₦ (optional)</span><input className="in" inputMode="decimal" value={charge} onChange={(e) => setCharge(e.target.value)} /></label>
        </div>
      )}
      <button className="btn block" disabled={busy || (!text.trim() && files.length === 0)} onClick={deliver}>{busy ? 'Working… please wait' : 'Deliver to customer'}</button>

      <label className="f"><span>Update for the customer (optional, e.g. “Delayed, I will deliver by 6pm”)</span>
        <input className="in" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} disabled={busy} /></label>
      <div className="row wrap">
        <button className="btn ghost" disabled={busy} onClick={sendNote}>Send update</button>
        <button className="btn danger" disabled={busy} onClick={refund}>Refund customer</button>
      </div>
      {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
    </div>
  );
}

export default function AdminOrders() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const [orders, setOrders] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    let q = supabase.from('orders').select('*, profiles(email)').limit(150);
    if (status === 'to_deliver') q = q.eq('status', 'processing').eq('delivery_type', 'manual').order('due_at', { ascending: true });
    else {
      q = q.order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
    }
    const { data } = await q;
    setOrders(data ?? []);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [status]);

  return (
    <>
      <h1 style={{ fontSize: '1.8rem' }}>Orders</h1>
      <div className="chips">
        {CHIPS.map(([v, l]) => (
          <button key={v} className={`chip ${status === v ? 'on' : ''}`} onClick={() => setParams(v ? { status: v } : {})}>{l}</button>
        ))}
      </div>
      {status === 'to_deliver' && <p className="muted small">Oldest and most overdue first. Deliver, send the customer an update, or refund.</p>}

      <div className="panel flat list">
        {orders.map((o) => {
          const cost = o.upstream_charge_kobo;
          const late = o.status === 'processing' && o.delivery_type === 'manual' ? lateLabel(o.due_at) : null;
          const needsAction = o.status === 'needs_review' || (o.status === 'processing' && o.delivery_type === 'manual');
          return (
            <div key={o.id} className="stack-s">
              <div className="row between" onClick={() => setOpen(open === o.id ? null : o.id)} style={{ cursor: 'pointer' }}>
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{o.product_name} × {o.quantity}</div>
                  <div className="muted small">{o.profiles?.email} · {dateTime(o.created_at)}</div>
                  <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                    {o.status === 'processing' && o.delivery_type === 'manual' && <span className="badge needs_review">Deliver this</span>}
                    {late && <span className="badge failed">{late}</span>}
                    {o.status === 'processing' && o.delivery_type === 'manual' && o.due_at && !late && <span className="badge">Due {dateTime(o.due_at)}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700 }}>{naira(o.total_kobo)}</div>
                  <span className={`badge ${o.status}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
                </div>
              </div>

              {(open === o.id || (status === 'to_deliver')) && (
                <div className="stack-s">
                  <div className="muted small">
                    Order {o.id.slice(0, 8)} · {o.delivery_type === 'supplier' ? `Supplier order ${o.upstream_order_id ?? '—'}` : o.delivery_type === 'stock' ? 'Your stock' : o.delivery_type === 'sms' ? `5sim number${o.sms_phone ? ` ${o.sms_phone}` : ''}` : 'Delivered by you'}
                    {' · '}Cost {cost != null ? naira(cost) : '—'}{cost != null && ` · Profit ${naira(o.total_kobo - cost)}`}
                  </div>
                  {o.customer_note && <div className="notice good"><b>Customer details:</b> {o.customer_note}</div>}
                  {o.error_code && <div className="notice warn"><b>{o.error_code}</b>{o.error_detail ? `: ${o.error_detail}` : ''}</div>}
                  {o.flag && <div className="notice warn">Flag: {o.flag}</div>}
                  {needsAction && <DeliverPanel order={o} onDone={() => { setOpen(null); void load(); }} />}
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
