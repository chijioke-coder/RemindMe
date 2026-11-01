import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { hueFor, initials, naira } from '../lib/format';
import BuyModal, { type StoreProduct } from './BuyModal';

export type StoreCategory = { id: number; name: string; slug: string };

export default function ProductBoard({ title, products, categories }: { title?: string; products: StoreProduct[]; categories: StoreCategory[] }) {
  const { session, settings } = useAuth();
  const nav = useNavigate();
  const [selected, setSelected] = useState<StoreProduct | null>(null);
  const catName = (id: number | null) => categories.find((c) => c.id === id)?.name ?? '';

  if (!products.length) return <div className="panel empty">No products here yet. Check back soon.</div>;

  return (
    <>
      <div className="board">
        {title && <div className="board-head">{title}</div>}
        {products.map((p) => {
          const hue = hueFor(p.category_id ?? p.id);
          const pct = Math.min(100, Math.round((p.stock / 60) * 100));
          const tracked = p.track_stock;
          const out = p.stock <= 0;
          return (
            <div className="item" key={p.id}>
              <div className="tile" style={{ background: `hsl(${hue} 55% 36%)` }}>{initials(catName(p.category_id) || p.name)}</div>
              <div className="grow">
                <div className="name">{p.name} {p.badge && <span className="badge hot">{p.badge}</span>}</div>
                <div className="muted small">{catName(p.category_id)} · {out ? 'Out of stock' : tracked ? `${p.stock} in stock` : 'Available'}</div>
                {tracked && <div className={`gauge ${p.stock < 8 ? 'low' : ''}`}><i style={{ width: `${out ? 0 : Math.max(pct, 6)}%` }} /></div>}
              </div>
              <div className="price">{naira(p.price_kobo)}</div>
              <button
                className="btn buy"
                disabled={out || settings?.purchases_paused}
                onClick={() => (session ? setSelected(p) : nav('/login', { state: { from: '/products' } }))}
              >
                {out ? 'Sold out' : 'Buy now'}
              </button>
            </div>
          );
        })}
      </div>
      {selected && <BuyModal product={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
