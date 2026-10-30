import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { callApi } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { naira } from '../lib/format';
import KeyList from './KeyList';

export type StoreProduct = { id: number; name: string; price_kobo: number; stock: number; category_id: number | null; description: string | null; badge: string | null };

export default function BuyModal({ product, onClose }: { product: StoreProduct; onClose: () => void }) {
  const { balanceKobo, refresh } = useAuth();
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ status: string; id: string } | null>(null);
  // one key per modal: a double tap can never create two orders
  const idem = useMemo(() => crypto.randomUUID(), []);

  const total = product.price_kobo * qty;
  const short = balanceKobo < total;
  const max = Math.max(1, Math.min(50, product.stock));

  async function buy() {
    setBusy(true);
    setError('');
    const r = await callApi<{ order: { id: string; status: string } }>('place_order', {
      product_id: product.id, quantity: qty, idempotency_key: idem,
    });
    setBusy(false);
    await refresh();
    if (!r.ok) { setError(r.detail || 'Could not place the order.'); return; }
    setResult({ status: r.order.status, id: r.order.id });
  }

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="sheet stack" role="dialog" aria-modal="true">
        <div className="row between">
          <h2>{product.name}</h2>
          {!busy && <button className="btn sm ghost" onClick={onClose}>Close</button>}
        </div>

        {!result && (
          <>
            {product.description && <p className="muted small">{product.description}</p>}
            <div className="line-item"><span>Price each</span><b>{naira(product.price_kobo)}</b></div>
            <div className="line-item">
              <span>Quantity <span className="muted small">({product.stock} in stock)</span></span>
              <span className="stepper">
                <button disabled={busy || qty <= 1} onClick={() => setQty(qty - 1)} aria-label="Less">−</button>
                <span>{qty}</span>
                <button disabled={busy || qty >= max} onClick={() => setQty(qty + 1)} aria-label="More">+</button>
              </span>
            </div>
            <div className="line-item total"><span>Total</span><span>{naira(total)}</span></div>
            <div className="line-item"><span className="muted">Wallet balance</span><span className={short ? 'amt-minus' : ''}>{naira(balanceKobo)}</span></div>
            {error && <div className="notice bad">{error}</div>}
            {short ? (
              <Link to="/wallet" className="btn gold block">Add {naira(total - balanceKobo)} to your wallet</Link>
            ) : (
              <button className="btn block" disabled={busy} onClick={buy}>
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
        {result?.status === 'processing' && (
          <div className="notice warn">
            Your order is being checked by our team and needs a little more time. You have not lost any money.
            Track it in <Link to="/orders">Orders</Link>.
          </div>
        )}
        {result && (result.status === 'failed' || result.status === 'refunded') && (
          <div className="notice bad">
            We could not complete this order. Your {naira(total)} has been returned to your wallet. Please try again later or contact support.
          </div>
        )}
      </div>
    </div>
  );
}
