import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { callApi } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { naira } from '../lib/format';
import ProductIcon from './ProductIcon';

export type Offer = {
  country: string; country_name: string; iso: string | null; prefix: string | null;
  service: string; service_name: string; icon_path: string | null;
  count: number; rate: number | null; price_kobo: number;
};

export default function BuyNumberModal({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const { balanceKobo, refresh } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // one key per popup: a double tap can never buy two numbers
  const idem = useMemo(() => crypto.randomUUID(), []);
  const short = balanceKobo < offer.price_kobo;

  async function buy() {
    setBusy(true);
    setError('');
    const r = await callApi<{ order: { id: string } }>('buy_number', { country: offer.country, service: offer.service, idempotency_key: idem });
    setBusy(false);
    await refresh();
    if (!r.ok) { setError(r.detail || 'Could not place the order.'); return; }
    onClose();
    nav(`/orders/${r.order.id}`, { state: { fresh: true } });
  }

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="sheet stack" role="dialog" aria-modal="true">
        <div className="row between">
          <div className="row"><ProductIcon path={offer.icon_path} label={offer.service_name} seed={offer.service} size={40} /><h2>{offer.service_name} number</h2></div>
          {!busy && <button className="btn sm ghost" onClick={onClose}>Close</button>}
        </div>
        <div className="line-item"><span className="muted">Country</span><b>{offer.country_name}{offer.prefix ? ` (${offer.prefix})` : ''}</b></div>
        <div className="line-item"><span className="muted">Available</span><span>{offer.count} numbers{offer.rate ? ` · ${Math.round(offer.rate)}% get a code` : ''}</span></div>
        <div className="line-item total"><span>Price</span><span>{naira(offer.price_kobo)}</span></div>
        <div className="line-item"><span className="muted">Wallet balance</span><span className={short ? 'amt-minus' : ''}>{naira(balanceKobo)}</span></div>

        <div className="notice warn small">
          You get a number straight away. Enter it on {offer.service_name}, ask for the code, and the code appears on your order page, usually within a minute or two (the number stays yours for up to 15 minutes).
          <b> If no code arrives, you are refunded automatically.</b>
        </div>

        {error && <div className="notice bad">{error}</div>}
        {short ? (
          <Link to="/wallet" className="btn gold block">Add {naira(offer.price_kobo - balanceKobo)} to your wallet</Link>
        ) : (
          <button className="btn block" disabled={busy} onClick={buy}>{busy ? 'Getting your number… please wait' : `Pay ${naira(offer.price_kobo)}`}</button>
        )}
      </div>
    </div>
  );
}
