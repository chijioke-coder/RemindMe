import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { naira } from '../lib/format';
import BuyModal, { type StoreProduct } from './BuyModal';
import ProductIcon from './ProductIcon';
import type { StoreCategory } from './ProductBoard';

/**
 * Products in a responsive grid (one column on phones, more on wider screens), grouped by category so each
 * product's stock stays separate. With layout="carousel" it is one swipeable row instead.
 */
export default function ProductRail({ products, categories, grouped = true, layout = 'grid', perCategory = 6, title }: {
  products: StoreProduct[]; categories: StoreCategory[]; grouped?: boolean; layout?: 'grid' | 'carousel'; perCategory?: number; title?: string;
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
          <ProductIcon path={p.icon_path} label={p.name} seed={p.category_id ?? p.id} size={46} />
          <div className="grow">
            <div className="name">{p.name}</div>
            <div className="muted small">{out ? (p.funds_limited ? 'Temporarily unavailable' : 'Sold out') : p.track_stock && p.show_quantity !== false ? `${p.stock} available` : p.delivery_hours ? `Ready in about ${p.delivery_hours}h` : 'Available'}</div>
          </div>
        </div>
        <div className="row between">
          <span className="price">{naira(p.price_kobo)}</span>
          <button className="btn sm" disabled={out || settings?.purchases_paused} onClick={() => open(p)}>{out ? (p.funds_limited ? 'Unavailable' : 'Sold out') : 'Buy'}</button>
        </div>
      </div>
    );
  };

  if (!products.length) return <div className="panel empty">New products are being added. Check back soon.</div>;

  const groups = grouped
    ? categories.map((c) => ({ c, list: products.filter((p) => p.category_id === c.id) })).filter((g) => g.list.length)
    : [{ c: null as StoreCategory | null, list: products }];

  return (
    <>
      <div className="stack">
        {title && <h2>{title}</h2>}
        {groups.map(({ c, list }) => (
          <div key={c?.id ?? 'all'} className="stack-s">
            {c && (
              <div className="row between">
                <h3>{c.name} <span className="muted small">· {list.length} {list.length === 1 ? 'listing' : 'listings'}</span></h3>
                {list.length > perCategory && <Link to={`/products?cat=${c.id}`} className="small">See all {list.length}</Link>}
              </div>
            )}
            <div className={layout === 'carousel' ? 'rail' : 'pgrid'}>
              {(layout === 'carousel' || !c ? list : list.slice(0, perCategory)).map(card)}
            </div>
          </div>
        ))}
      </div>
      {selected && <BuyModal product={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
