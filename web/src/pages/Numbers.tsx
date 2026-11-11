import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { naira } from '../lib/format';
import ProductIcon from '../components/ProductIcon';
import BuyNumberModal, { type Offer } from '../components/BuyNumberModal';

type ServiceRow = { service: string; service_name: string; icon_path: string | null; from_kobo: number; countries: number; numbers: number };
type CountryRow = { country: string; country_name: string; iso: string | null; prefix: string | null; from_kobo: number; services: number; numbers: number };
const PAGE = 40;

export default function Numbers() {
  const { settings, session } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<'service' | 'country'>('service');
  const [q, setQ] = useState('');
  const [services, setServices] = useState<ServiceRow[] | null>(null);
  const [countries, setCountries] = useState<CountryRow[] | null>(null);
  const [sel, setSel] = useState<{ slug: string; name: string } | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [buy, setBuy] = useState<Offer | null>(null);
  const off = settings && !(settings as unknown as { sms_show?: boolean }).sms_show;

  useEffect(() => {
    supabase.from('storefront_sms_services').select('*').order('numbers', { ascending: false }).limit(2000)
      .then(({ data }) => setServices((data ?? []) as ServiceRow[]));
    supabase.from('storefront_sms_countries').select('*').order('numbers', { ascending: false }).limit(500)
      .then(({ data }) => setCountries((data ?? []) as CountryRow[]));
  }, []);

  async function loadOffers(slug: string, from: number, replace: boolean) {
    setLoading(true);
    const col = mode === 'service' ? 'service' : 'country';
    const { data } = await supabase.from('storefront_sms').select('*').eq(col, slug).order('price_kobo').range(from, from + PAGE - 1);
    const rows = (data ?? []) as Offer[];
    setOffers((cur) => (replace ? rows : [...cur, ...rows]));
    setMore(rows.length === PAGE);
    setLoading(false);
  }

  function choose(slug: string, name: string) {
    setSel({ slug, name });
    setOffers([]);
    void loadOffers(slug, 0, true);
  }

  const needle = q.trim().toLowerCase();
  const svc = (services ?? []).filter((s) => !needle || s.service_name.toLowerCase().includes(needle) || s.service.includes(needle)).slice(0, 120);
  const cty = (countries ?? []).filter((c) => !needle || c.country_name.toLowerCase().includes(needle) || c.country.includes(needle)).slice(0, 120);

  return (
    <>
      <div className="stack-s">
        <span className="eyebrow dark">Virtual numbers</span>
        <h1 style={{ fontSize: 'clamp(1.6rem, 5vw, 2.4rem)' }}>Get a number for verification</h1>
        <p className="muted">Pick the app, pick a country, and get a number straight away. Your code appears on your order page. No code, no charge: you are refunded automatically.</p>
      </div>

      {off && <div className="panel empty">Virtual numbers are not available right now. Please check back soon.</div>}

      {!off && !sel && (
        <>
          <div className="chips">
            <button className={`chip ${mode === 'service' ? 'on' : ''}`} onClick={() => { setMode('service'); setQ(''); }}>By app</button>
            <button className={`chip ${mode === 'country' ? 'on' : ''}`} onClick={() => { setMode('country'); setQ(''); }}>By country</button>
          </div>
          <input className="in" placeholder={mode === 'service' ? 'Search apps, e.g. WhatsApp' : 'Search countries, e.g. USA'} value={q} onChange={(e) => setQ(e.target.value)} />

          {(mode === 'service' ? services : countries) === null ? <p className="muted">Loading…</p> : (
            <div className="board">
              {mode === 'service' && svc.map((s) => (
                <div className="item" key={s.service}>
                  <ProductIcon path={s.icon_path} label={s.service_name} seed={s.service} />
                  <div className="grow"><div className="name">{s.service_name}</div><div className="muted small">{s.countries} {s.countries === 1 ? 'country' : 'countries'} · from {naira(s.from_kobo)}</div></div>
                  <span />
                  <button className="btn buy" onClick={() => choose(s.service, s.service_name)}>Choose</button>
                </div>
              ))}
              {mode === 'country' && cty.map((c) => (
                <div className="item" key={c.country}>
                  <ProductIcon path={null} label={c.iso ? c.iso.toUpperCase() : c.country_name} seed={c.country} />
                  <div className="grow"><div className="name">{c.country_name}</div><div className="muted small">{c.services} apps · from {naira(c.from_kobo)}</div></div>
                  <span />
                  <button className="btn buy" onClick={() => choose(c.country, c.country_name)}>Choose</button>
                </div>
              ))}
              {((mode === 'service' && svc.length === 0) || (mode === 'country' && cty.length === 0)) && <div className="panel empty" style={{ gridColumn: '1 / -1' }}>Nothing matches. Try another search.</div>}
            </div>
          )}
        </>
      )}

      {!off && sel && (
        <>
          <div className="row between wrap">
            <h2>{sel.name}</h2>
            <button className="btn sm ghost" onClick={() => { setSel(null); setOffers([]); }}>← Back</button>
          </div>
          {offers.length === 0 && !loading && <div className="panel empty">No numbers available right now. Try another one.</div>}
          <div className="board">
            {offers.map((o) => (
              <div className="item" key={`${o.country}-${o.service}`}>
                <ProductIcon path={mode === 'service' ? null : o.icon_path} label={mode === 'service' ? (o.iso ? o.iso.toUpperCase() : o.country_name) : o.service_name} seed={mode === 'service' ? o.country : o.service} />
                <div className="grow">
                  <div className="name">{mode === 'service' ? o.country_name : o.service_name}{mode === 'service' && o.prefix ? ` ${o.prefix}` : ''}</div>
                  <div className="muted small">{o.count} available{o.rate ? ` · ${Math.round(o.rate)}% get a code` : ''}</div>
                </div>
                <div className="price">{naira(o.price_kobo)}</div>
                <button className="btn buy" onClick={() => (session ? setBuy(o) : nav('/login', { state: { from: '/numbers' } }))}>Buy number</button>
              </div>
            ))}
          </div>
          {loading && <p className="muted">Loading…</p>}
          {more && !loading && <button className="btn ghost block" onClick={() => void loadOffers(sel.slug, offers.length, false)}>Show more</button>}
        </>
      )}

      {buy && <BuyNumberModal offer={buy} onClose={() => setBuy(null)} />}
    </>
  );
}
