import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import BuyNumberModal, { type Offer } from './BuyNumberModal';
import { OfferRow } from './NumberBrowser';

const PAGE = 30;

/** every word typed must match the app, the country, its code (us, ng) or its dialling prefix: "usa whatsapp" works */
export default function NumberSearch({ q, onCount }: { q: string; onCount?: (n: number) => void }) {
  const { session } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<Offer[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [buy, setBuy] = useState<Offer | null>(null);

  async function run(from: number, replace: boolean, text: string) {
    const toks = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 4);
    if (toks.length === 0) { setRows([]); setMore(false); onCount?.(0); return; }
    setLoading(true);
    let qb = supabase.from('storefront_sms').select('*');
    for (const t of toks) qb = qb.or(`service_name.ilike.%${t}%,country_name.ilike.%${t}%,iso.ilike.${t},prefix.ilike.%${t}%`);
    const { data } = await qb.order('price_kobo').range(from, from + PAGE - 1);
    const got = (data ?? []) as Offer[];
    setRows((cur) => { const next = replace ? got : [...cur, ...got]; onCount?.(next.length); return next; });
    setMore(got.length === PAGE);
    setLoading(false);
  }

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => { if (alive) void run(0, true, q); }, 300);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const goBuy = (o: Offer) => (session ? setBuy(o) : nav('/login', { state: { from: '/products' } }));
  if (!rows.length && loading) return <p className="muted">Searching numbers…</p>;
  if (!rows.length) return null;
  return (
    <>
      <div className="board">
        <div className="board-head">Virtual numbers</div>
        {rows.map((o) => <OfferRow key={`${o.country}-${o.service}`} o={o} showApp onBuy={goBuy} />)}
      </div>
      {more && !loading && <button className="btn ghost block" onClick={() => void run(rows.length, false, q)}>Show more numbers</button>}
      {buy && <BuyNumberModal offer={buy} onClose={() => setBuy(null)} />}
    </>
  );
}
