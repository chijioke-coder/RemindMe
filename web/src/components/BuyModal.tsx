import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { callApi, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { naira } from '../lib/format';
import KeyList from './KeyList';
import ProductIcon from './ProductIcon';

export type StoreProduct = {
  id: number; name: string; price_kobo: number; stock: number; category_id: number | null;
  description: string | null; badge: string | null;
  input_label: string | null; delivery_note: string | null; delivery_type: string; track_stock: boolean; pick_items: boolean;
  icon_path: string | null; delivery_hours: number | null;
};

export default function BuyModal({ product, onClose }: { product: StoreProduct; onClose: () => void }) {
  const { balanceKobo, refresh } = useAuth();
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ status: string; id: string; delivery_type: string; reason?: string | null } | null>(null);
  const [items, setItems] = useState<{ id: number; label: string }[] | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  // one key per modal: a double tap can never create two orders
  const idem = useMemo(() => crypto.randomUUID(), []);

  const pick = product.pick_items;
  useEffect(() => {
    if (!pick) return;
    supabase.from('stock_listing').select('id, label').eq('product_id', product.id).order('id')
      .then(({ data }) => setItems((data ?? []) as { id: number; label: string }[]));
  }, [pick, product.id]);
  const count = pick ? picked.length : qty;
  const toggleItem = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 50 ? [...p, id] : p));

  const total = product.price_kobo * count;
  const short = balanceKobo < total;
  const max = Math.max(1, Math.min(50, product.stock));
  const needsNote = Boolean(product.input_label);

  async function buy() {
    setBusy(true);
    setError('');
    const r = await callApi<{ order: { id: string; status: string; delivery_type: string; reason?: string | null } }>('place_order', {
      product_id: product.id, quantity: count, idempotency_key: idem, customer_note: note,
      ...(pick ? { item_ids: picked } : {}),
    });
    setBusy(false);
    await refresh();
    if (!r.ok) { setError(r.detail || 'Could not place the order.'); return; }
    setResult({ status: r.order.status, id: r.order.id, delivery_type: r.order.delivery_type, reason: r.order.reason });
  }

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="sheet stack" role="dialog" aria-modal="true">
        <div className="row between">
          <div className="row"><ProductIcon path={product.icon_path} label={product.name} seed={product.category_id ?? product.id} size={40} /><h2>{product.name}</h2></div>
          {!busy && <button className="btn sm ghost" onClick={onClose}>Close</button>}
        </div>

        {!result && (
          <>
            {product.description && <p className="muted small">{product.description}</p>}
            {product.delivery_type === 'manual' && (
              <div className="notice warn small">
                Prepared by hand{product.delivery_hours ? `, usually within ${product.delivery_hours} ${product.delivery_hours === 1 ? 'hour' : 'hours'}` : ''}.
                {product.delivery_note ? ` ${product.delivery_note}` : ''} If it runs late, you can contact support from your Orders page.
              </div>
            )}
            {product.delivery_type !== 'manual' && product.delivery_note && <div className="notice warn small">{product.delivery_note}</div>}
            <div className="line-item"><span>Price each</span><b>{naira(product.price_kobo)}</b></div>
            {pick ? (
              <div className="stack-s">
                <div className="row between">
                  <b className="small">Available ({items?.length ?? 0})</b>
                  {items && items.length > 0 && (
                    <button type="button" className="btn sm ghost" disabled={busy}
                      onClick={() => setPicked(picked.length === Math.min(items.length, 50) ? [] : items.slice(0, 50).map((i) => i.id))}>
                      {picked.length === Math.min(items.length, 50) ? 'Clear' : 'Select all'}
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: 230, overflowY: 'auto', border: '1.5px solid var(--line)', borderRadius: 12 }}>
                  {items === null && <p className="muted small" style={{ padding: 14 }}>Loading…</p>}
                  {items && items.length === 0 && <p className="muted small" style={{ padding: 14 }}>Nothing available right now.</p>}
                  {items?.map((i) => (
                    <label key={i.id} className="check" style={{ padding: '11px 14px', borderBottom: '1px solid var(--line)' }}>
                      <input type="checkbox" checked={picked.includes(i.id)} disabled={busy} onChange={() => toggleItem(i.id)} />
                      <span className="mono">{i.label}</span>
                    </label>
                  ))}
                </div>
                <p className="muted small">{picked.length} selected. Your login details appear after payment.</p>
              </div>
            ) : (
            <div className="line-item">
              <span>Quantity {product.track_stock && <span className="muted small">({product.stock} in stock)</span>}</span>
              <span className="stepper">
                <button disabled={busy || qty <= 1} onClick={() => setQty(qty - 1)} aria-label="Less">−</button>
                <span>{qty}</span>
                <button disabled={busy || qty >= max} onClick={() => setQty(qty + 1)} aria-label="More">+</button>
              </span>
            </div>
            )}
            {needsNote && (
              <label className="f"><span>{product.input_label}</span>
                <input className="in" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} disabled={busy} />
              </label>
            )}
            <div className="line-item total"><span>Total</span><span>{naira(total)}</span></div>
            <div className="line-item"><span className="muted">Wallet balance</span><span className={short ? 'amt-minus' : ''}>{naira(balanceKobo)}</span></div>
            {error && <div className="notice bad">{error}</div>}
            {short ? (
              <Link to="/wallet" className="btn gold block">Add {naira(total - balanceKobo)} to your wallet</Link>
            ) : (
              <button className="btn block" disabled={busy || count < 1 || (needsNote && !note.trim())} onClick={buy}>
                {busy ? 'Processing your order… please wait' : `Pay ${naira(total)}`}
              </button>
            )}
            <p className="muted small">Your wallet is charged once. If the order fails, you are refunded automatically.</p>
          </>
        )}

        {result?.status === 'completed' && (
          <>
            <div className="notice good">Order complete. Your details are below and saved in Orders.</div>
            <KeyList orderId={result.id} autoLoad />
            <Link to="/orders" className="btn ghost block" onClick={onClose}>View all orders</Link>
          </>
        )}
        {result?.status === 'processing' && result.delivery_type === 'manual' && (
          <>
            <div className="notice good">
              Order received. {product.delivery_note || 'We will deliver it shortly.'} You can follow it in Orders.
            </div>
            <Link to="/orders" className="btn ghost block" onClick={onClose}>Go to Orders</Link>
          </>
        )}
        {result?.status === 'processing' && result.delivery_type !== 'manual' && (
          <div className="notice warn">
            Your order is being checked by our team and needs a little more time. You have not lost any money.
            Track it in <Link to="/orders">Orders</Link>.
          </div>
        )}
        {result && (result.status === 'failed' || result.status === 'refunded') && result.reason === 'items_taken' && (
          <div className="notice bad">
            Someone bought one of those items just before you. Your {naira(total)} is back in your wallet. Please pick again.
          </div>
        )}
        {result && (result.status === 'failed' || result.status === 'refunded') && result.reason !== 'items_taken' && (
          <div className="notice bad">
            We could not complete this order. Your {naira(total)} has been returned to your wallet. Please try again later or contact support.
          </div>
        )}
      </div>
    </div>
  );
}
