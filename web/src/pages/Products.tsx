import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import type { StoreProduct } from '../components/BuyModal';
import ProductBoard, { type StoreCategory } from '../components/ProductBoard';

export default function Products() {
  const [params, setParams] = useSearchParams();
  const { settings } = useAuth();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const cat = params.get('cat');

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

  const shown = products.filter((p) =>
    (!cat || String(p.category_id) === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <h1 style={{ fontSize: '2rem' }}>Products</h1>
      <input className="in" placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        <button className={`chip ${!cat ? 'on' : ''}`} onClick={() => setParams({})}>All</button>
        {categories.map((c) => (
          <button key={c.id} className={`chip ${cat === String(c.id) ? 'on' : ''}`} onClick={() => setParams({ cat: String(c.id) })}>{c.name}</button>
        ))}
        {(settings as unknown as { sms_show?: boolean } | null)?.sms_show && <Link to="/numbers" className="chip">Virtual numbers</Link>}
      </div>
      {loading ? <p className="muted">Loading products…</p> : <ProductBoard products={shown} categories={categories} />}
    </>
  );
}
