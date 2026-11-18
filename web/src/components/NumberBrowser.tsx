import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { naira } from '../lib/format';
import ProductIcon from './ProductIcon';
import BuyNumberModal, { type Offer } from './BuyNumberModal';

type ServiceRow = { service: string; service_name: string; icon_path: string | null; from_kobo: number; countries: number; numbers: number };
type CountryRow = { country: string; country_name: string; iso: string | null; prefix: string | null; from_kobo: number; services: number; numbers: number };
const PAGE = 40;

/** one row for a number we can sell: used by the browser and by the search results */
export function OfferRow({ o, showApp, onBuy }: { o: Offer; showApp: boolean; onBuy: (o: Offer) => void }) {
  return (
    <div className="item">
      <ProductIcon path={showApp ? o.icon_path : null} label={showApp ? o.service_name : (o.iso ? o.iso.toUpperCase() : o.country_name)} seed={showApp ? o.service : o.country} />
      <div className="grow">
        <div className="name">{showApp ? `${o.service_name} · ${o.country_name}` : o.country_name}{o.prefix ? ` ${o.prefix}` : ''} <span className="kind num">Virtual number</span></div>
        <div className="muted small">{o.count} available{o.rate ? ` · ${Math.round(o.rate)}% get a code` : ''}</div>
      </div>
      <div className="price">{naira(o.price_kobo)}</div>
      <button className="btn buy" onClick={() => onBuy(o)}>Buy number</button>
    </div>
  );
}

/** the app/country browser. The page's search box lives outside, so this only shows the lists. */
export default function NumberBrowser({ initialService }: { initialService?: string | null }) {
  const { session } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<'service' | 'country'>('service');
  const [services, setServices] = useState<ServiceRow[] | null>(null);
  const [countries, setCountries] = useState<CountryRow[] | null>(null);
  const [sel, setSel] = useState<{ slug: string; name: string } | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [buy, setBuy] = useState<Offer | null>(null);

  useEffect(() => {
    supabase.from('storefront_sms_services').select('*').order('numbers', { ascending: false }).limit(2000)
      .then(({ data }) => setServices((data ?? []) as ServiceRow[]));
    supabase.from('storefront_sms_countries').select('*').order('numbers', { ascending: false }).limit(500)
      .then(({ data }) => setCountries((data ?? []) as CountryRow[]));
  }, []);

  async function loadOffers(m: 'service' | 'country', slug: string, from: number, replace: boolean) {
    setLoading(true);
    const col = m === 'service' ? 'service' : 'country';
    const { data } = await supabase.from('storefront_sms').select('*').eq(col, slug).order('price_kobo').range(from, from + PAGE - 1);
    const rows = (data ?? []) as Offer[];
    setOffers((cur) => (replace ? rows : [...cur, ...rows]));
    setMore(rows.length === PAGE);
    setLoading(false);
  }

  function choose(m: 'service' | 'country', slug: string, name: string) {
    setMode(m);
    setSel({ slug, name });
    setOffers([]);
    void loadOffers(m, slug, 0, true);
  }

  // coming from the shop front page with an app already picked
  useEffect(() => {
    if (!initialService || !services || sel) return;
    const s = services.find((x) => x.service === initialService);
    if (s) choose('service', s.service, s.service_name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialService, services]);

  const goBuy = (o: Offer) => (session ? setBuy(o) : nav('/login', { state: { from: '/products?tab=numbers' } }));

  return (
    <>
      {!sel && (
        <>
          <div className="chips">
            <button className={`chip ${mode === 'service' ? 'on' : ''}`} onClick={() => setMode('service')}>By app</button>
            <button className={`chip ${mode === 'country' ? 'on' : ''}`} onClick={() => setMode('country')}>By country</button>
          </div>
          {(mode === 'service' ? services : countries) === null ? <p className="muted">Loading…</p> : (
            <div className="board">
              {mode === 'service' && (services ?? []).slice(0, 150).map((s) => (
                <div className="item" key={s.service}>
                  <ProductIcon path={s.icon_path} label={s.service_name} seed={s.service} />
                  <div className="grow"><div className="name">{s.service_name} <span className="kind num">Virtual number</span></div><div className="muted small">{s.countries} {s.countries === 1 ? 'country' : 'countries'} · from {naira(s.from_kobo)}</div></div>
                  <span />
                  <button className="btn buy" onClick={() => choose('service', s.service, s.service_name)}>Choose</button>
                </div>
              ))}
              {mode === 'country' && (countries ?? []).slice(0, 150).map((c) => (
                <div className="item" key={c.country}>
                  <ProductIcon path={null} label={c.iso ? c.iso.toUpperCase() : c.country_name} seed={c.country} />
                  <div className="grow"><div className="name">{c.country_name} <span className="kind num">Virtual number</span></div><div className="muted small">{c.services} apps · from {naira(c.from_kobo)}</div></div>
                  <span />
                  <button className="btn buy" onClick={() => choose('country', c.country, c.country_name)}>Choose</button>
                </div>
              ))}
              {((mode === 'service' && (services ?? []).length === 0) || (mode === 'country' && (countries ?? []).length === 0)) && <div className="panel empty" style={{ gridColumn: '1 / -1' }}>No numbers on sale right now. Please check back soon.</div>}
            </div>
          )}
          <p className="muted small">Looking for something specific? Type an app or a country in the search box above, for example “whatsapp nigeria”.</p>
        </>
      )}

      {sel && (
        <>
          <div className="row between wrap">
            <h2>{sel.name}</h2>
            <button className="btn sm ghost" onClick={() => { setSel(null); setOffers([]); }}>← Back</button>
          </div>
          {offers.length === 0 && !loading && <div className="panel empty">No numbers available right now. Try another one.</div>}
          <div className="board">
            {offers.map((o) => <OfferRow key={`${o.country}-${o.service}`} o={o} showApp={mode === 'country'} onBuy={goBuy} />)}
          </div>
          {loading && <p className="muted">Loading…</p>}
          {more && !loading && <button className="btn ghost block" onClick={() => void loadOffers(mode, sel.slug, offers.length, false)}>Show more</button>}
        </>
      )}

      {buy && <BuyNumberModal offer={buy} onClose={() => setBuy(null)} />}
    </>
  );
}
