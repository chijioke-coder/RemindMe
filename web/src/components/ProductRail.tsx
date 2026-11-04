import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { naira } from '../lib/format';
import BuyModal, { type StoreProduct } from './BuyModal';
import ProductIcon from './ProductIcon';
import type { StoreCategory } from './ProductBoard';

/** Swipeable rows of products. Each category (and each product) is its own row: stock is never mixed together. */
export default function ProductRail({ products, categories, grouped = true, title }: {
  products: StoreProduct[]; categories: StoreCategory[]; grouped?: boolean; title?: string;
}) {
  const { session, settings } = useAuth();
  const nav = useNavigate();
  const [selected, setSelected] = useState<StoreProduct | null>(null);

  const open = (p: StoreProduct) => (session ? setSelected(p) : nav('/login', { state: { from: '/products' } }));

  const card = (p: StoreProduct) => {
    const out = p.stock <= 0;
    return (
      <div className="rail-card" key={p.id}>
        <div className="row">
          <ProductIcon path={p.icon_path} label={p.name} seed={p.category_id ?? p.id} size={44} />
          <div className="grow">
            <div className="name">{p.name}</div>
            <div className="muted small">{out ? 'Sold out' : p.track_stock ? `${p.stock} available` : p.delivery_hours ? `Ready in about ${p.delivery_hours}h` : 'Available'}</div>
          </div>
        </div>
        <div className="row between">
          <span className="price">{naira(p.price_kobo)}</span>
          <button className="btn sm" disabled={out || settings?.purchases_paused} onClick={() => open(p)}>{out ? 'Sold out' : 'Buy'}</button>
        </div>
      </div>
    );
  };

  const rows = grouped
    ? categories.map((c) => ({ c, list: products.filter((p) => p.category_id === c.id) })).filter((r) => r.list.length)
    : [{ c: null as StoreCategory | null, list: products }];

  if (!products.length) return <div className="panel empty">New products are being added. Check back soon.</div>;

  return (
    <>
      <div className="stack">
        {title && <h2>{title}</h2>}
        {rows.map(({ c, list }) => (
          <div key={c?.id ?? 'all'} className="stack-s">
            {c && (
              <div className="row between">
                <h3>{c.name} <span className="muted small">· {list.length} {list.length === 1 ? 'listing' : 'listings'}</span></h3>
                <Link to={`/products?cat=${c.id}`} className="small">See all</Link>
              </div>
            )}
            <div className="rail">{list.map(card)}</div>
          </div>
        ))}
      </div>
      {selected && <BuyModal product={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
