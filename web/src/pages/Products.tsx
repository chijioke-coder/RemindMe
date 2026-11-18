import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { naira } from '../lib/format';
import type { StoreProduct } from '../components/BuyModal';
import ProductBoard, { type StoreCategory } from '../components/ProductBoard';
import ProductIcon from '../components/ProductIcon';
import NumberBrowser from '../components/NumberBrowser';
import NumberSearch from '../components/NumberSearch';

type Top = { service: string; service_name: string; icon_path: string | null; from_kobo: number; countries: number };

export default function Products() {
  const [params, setParams] = useSearchParams();
  const { settings } = useAuth();
  const smsOn = !!(settings as unknown as { sms_show?: boolean } | null)?.sms_show;
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [top, setTop] = useState<Top[]>([]);
  const cat = params.get('cat');
  const tab = params.get('tab'); // 'numbers' or nothing
  const app = params.get('app');
  const needle = q.trim().toLowerCase();

  useEffect(() => {
    Promise.all([
      supabase.from('storefront_products').select('*').order('sort_order').order('id'),
      supabase.from('categories').select('id,name,slug').eq('is_active', true).order('sort_order'),
    ]).then(([p, c]) => {
      setProducts((p.data ?? []) as StoreProduct[]);
      setCategories((c.data ?? []) as StoreCategory[]);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!smsOn) return;
    supabase.from('storefront_sms_services').select('service,service_name,icon_path,from_kobo,countries').order('numbers', { ascending: false }).limit(6)
      .then(({ data }) => setTop((data ?? []) as Top[]));
  }, [smsOn]);

  const catName = (id: number | null) => categories.find((c) => c.id === id)?.name ?? '';
  const onNumbers = tab === 'numbers';
  const shown = onNumbers ? [] : products.filter((p) =>
    (!cat || String(p.category_id) === cat) &&
    (!needle || needle.split(/\s+/).every((w) => `${p.name} ${catName(p.category_id)}`.toLowerCase().includes(w))));
  const showNumbers = smsOn && (onNumbers || !cat);

  return (
    <>
      <h1 style={{ fontSize: '2rem' }}>Shop</h1>
      <input className="in" placeholder="Search everything: a product, an app, a country (e.g. whatsapp nigeria)" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        <button className={`chip ${!cat && !onNumbers ? 'on' : ''}`} onClick={() => setParams({})}>All</button>
        {smsOn && <button className={`chip ${onNumbers ? 'on' : ''}`} onClick={() => setParams({ tab: 'numbers' })}>Virtual numbers</button>}
        {categories.map((c) => (
          <button key={c.id} className={`chip ${cat === String(c.id) ? 'on' : ''}`} onClick={() => setParams({ cat: String(c.id) })}>{c.name}</button>
        ))}
      </div>

      {!onNumbers && (loading ? <p className="muted">Loading products…</p> : (shown.length > 0 || !needle) && <ProductBoard products={shown} categories={categories} />)}

      {showNumbers && needle && <NumberSearch q={q} />}

      {showNumbers && !needle && !onNumbers && top.length > 0 && (
        <div className="board">
          <div className="board-head">Virtual numbers</div>
          {top.map((s) => (
            <div className="item" key={s.service}>
              <ProductIcon path={s.icon_path} label={s.service_name} seed={s.service} />
              <div className="grow"><div className="name">{s.service_name} <span className="kind num">Virtual number</span></div><div className="muted small">{s.countries} {s.countries === 1 ? 'country' : 'countries'} · from {naira(s.from_kobo)}</div></div>
              <span />
              <button className="btn buy" onClick={() => setParams({ tab: 'numbers', app: s.service })}>Choose</button>
            </div>
          ))}
          <div className="item"><div className="grow muted small">Hundreds more apps and countries.</div><span /><span /><button className="btn ghost" onClick={() => setParams({ tab: 'numbers' })}>See all numbers</button></div>
        </div>
      )}

      {onNumbers && smsOn && !needle && <NumberBrowser initialService={app} />}
      {onNumbers && !smsOn && <div className="panel empty">Virtual numbers are not available right now. Please check back soon.</div>}
    </>
  );
}
