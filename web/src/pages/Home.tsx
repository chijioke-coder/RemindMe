import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type { StoreProduct } from '../components/BuyModal';
import ProductBoard, { type StoreCategory } from '../components/ProductBoard';

export default function Home() {
  const { session } = useAuth();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [categories, setCategories] = useState<StoreCategory[]>([]);

  useEffect(() => {
    supabase.from('storefront_products').select('*').order('sort_order').order('id').limit(8)
      .then(({ data }) => setProducts((data ?? []) as StoreProduct[]));
    supabase.from('categories').select('id,name,slug').eq('is_active', true).order('sort_order')
      .then(({ data }) => setCategories((data ?? []) as StoreCategory[]));
  }, []);

  return (
    <>
      <section className="hero">
        <h1>Verified accounts and numbers, delivered the moment you pay.</h1>
        <p>Fund your wallet once, pick what you need, and your details appear on screen. No waiting for a seller to reply.</p>
        <div className="row wrap">
          <Link to="/products" className="btn gold">Browse products</Link>
          <Link to={session ? '/wallet' : '/signup'} className="btn ghost" style={{ color: '#fff', borderColor: '#3b4a57' }}>
            {session ? 'Fund wallet' : 'Create account'}
          </Link>
        </div>
        <div className="ticker">
          <span><b>Instant</b> delivery</span>
          <span><b>Auto</b> refund if an order fails</span>
          <span><b>24/7</b> support</span>
        </div>
      </section>

      {categories.length > 0 && (
        <section className="stack-s">
          <h2>Shop by category</h2>
          <div className="chips">
            {categories.map((c) => <Link key={c.id} to={`/products?cat=${c.id}`} className="chip">{c.name}</Link>)}
          </div>
        </section>
      )}

      <section className="stack-s">
        <div className="row between"><h2>Available now</h2><Link to="/products">See all</Link></div>
        <ProductBoard products={products} categories={categories} />
      </section>
      <section className="stack-s">
        <h2>How it works</h2>
        <div className="steps">
          <div className="step"><div className="num">1</div><h3>Fund your wallet</h3><p className="muted small">Pay once with Paystack. Your balance updates in seconds.</p></div>
          <div className="step"><div className="num">2</div><h3>Pick a product</h3><p className="muted small">Choose what you need and the quantity. The total is shown before you pay.</p></div>
          <div className="step"><div className="num">3</div><h3>Get it instantly</h3><p className="muted small">Your details appear on screen and stay saved in Orders. Failed orders are refunded automatically.</p></div>
        </div>
      </section>
    </>
  );
}
