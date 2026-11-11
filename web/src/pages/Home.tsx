import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { naira } from '../lib/format';
import type { StoreProduct } from '../components/BuyModal';
import type { StoreCategory } from '../components/ProductBoard';
import Carousel from '../components/Carousel';
import ProductRail from '../components/ProductRail';
import AnnouncementCard from '../components/AnnouncementCard';

const FAQ: [string, string][] = [
  ['Is every item unique?', 'Yes. Each account, number or page is its own item. Once someone buys it, it is gone from the list, so you never share what you buy.'],
  ['What happens if my order fails?', 'Your wallet is refunded automatically and straight away. You never pay for something you did not receive.'],
  ['How do I pay?', 'Add money to your wallet by bank transfer or card, then spend it on anything in the store. The wallet updates by itself.'],
  ['Some orders are prepared by hand. How long do they take?', 'Each one shows a promised delivery time. If it runs late, a Contact support button appears on your order page.'],
];

export default function Home() {
  const { session, profile, balanceKobo, settings } = useAuth();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const wa = settings?.support_whatsapp?.replace(/\D/g, '');

  useEffect(() => {
    supabase.from('storefront_products').select('*').order('sort_order').order('id', { ascending: false }).limit(120)
      .then(({ data }) => setProducts((data ?? []) as StoreProduct[]));
    supabase.from('categories').select('id,name,slug').eq('is_active', true).order('sort_order')
      .then(({ data }) => setCategories((data ?? []) as StoreCategory[]));
  }, []);

  const first = profile?.full_name?.trim().split(' ')[0] || profile?.email.split('@')[0] || '';

  const slides = [
    (
      <div className="slide s1">
        <span className="eyebrow">Unique, one-of-a-kind listings</span>
        <h1>Pick exactly what you buy.</h1>
        <p>Every account, number and page is its own item. Choose the one you want and it is yours alone.</p>
        <div className="row wrap"><Link to="/products" className="btn gold">Browse the store</Link>{!session && <Link to="/signup" className="btn light">Create account</Link>}</div>
      </div>
    ),
    (
      <div className="slide s2">
        <span className="eyebrow">Fast and simple</span>
        <h1>Fund once. Buy in seconds.</h1>
        <p>Top up your wallet by bank transfer, then your purchase appears on its own page as soon as it is ready.</p>
        <div className="row wrap"><Link to={session ? '/wallet' : '/signup'} className="btn gold">{session ? 'Fund wallet' : 'Get started'}</Link></div>
      </div>
    ),
    (
      <div className="slide s3">
        <span className="eyebrow">Protected purchases</span>
        <h1>If it fails, you get your money back.</h1>
        <p>Failed orders are refunded to your wallet automatically, and your details stay private to you.</p>
        <div className="row wrap"><Link to="/support" className="btn gold">How we protect you</Link></div>
      </div>
    ),
    (
      <div className="slide s4">
        <span className="eyebrow">We are a message away</span>
        <h1>Need help? Talk to a person.</h1>
        <p>Running late or something looks wrong? Reach support on WhatsApp and quote your order.</p>
        <div className="row wrap">
          {wa ? <a className="btn gold" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">Chat on WhatsApp</a> : <Link to="/support" className="btn gold">Contact support</Link>}
        </div>
      </div>
    ),
  ];

  return (
    <>
      {session && (
        <div className="panel row between wrap">
          <div>
            <div className="muted small">Welcome back</div>
            <h2>{first}</h2>
          </div>
          <div className="row wrap">
            <span className="badge on" style={{ fontSize: '0.95rem', padding: '6px 14px' }}>{naira(balanceKobo)}</span>
            <Link to="/wallet" className="btn sm gold">Add funds</Link>
            <Link to="/orders" className="btn sm ghost">My orders</Link>
          </div>
        </div>
      )}

      <Carousel slides={slides} />
      <AnnouncementCard />
      {(settings as unknown as { sms_show?: boolean } | null)?.sms_show && (
        <div className="panel row between wrap">
          <div className="grow"><h2>Virtual numbers</h2><p className="muted">Need a number to verify WhatsApp, Telegram, Facebook and more? Get one in seconds and receive your code right here.</p></div>
          <Link to="/numbers" className="btn gold">Get a number</Link>
        </div>
      )}

      {categories.length > 0 && (
        <section className="stack-s">
          <span className="eyebrow dark">Shop by category</span>
          <div className="chips">
            {categories.map((c) => <Link key={c.id} to={`/products?cat=${c.id}`} className="chip">{c.name}</Link>)}
          </div>
        </section>
      )}

      <section className="stack-s">
        <span className="eyebrow dark">Available now</span>
        <h2>Each category has its own stock</h2>
        <p className="muted">Facebook pages, VPNs and every other product are listed separately, with the number available shown on each.</p>
        <ProductRail products={products} categories={categories} />
      </section>

      <section className="stack-s">
        <span className="eyebrow dark">How it works</span>
        <h2>Three steps, no waiting around</h2>
        <div className="steps">
          <div className="step"><div className="num">1</div><h3>Fund your wallet</h3><p className="muted small">Send money by bank transfer or card. Your balance updates on its own.</p></div>
          <div className="step"><div className="num">2</div><h3>Choose your item</h3><p className="muted small">Pick a product, and where it is offered, the exact item you want.</p></div>
          <div className="step"><div className="num">3</div><h3>Get it delivered</h3><p className="muted small">Your details, links or files appear on your order page and stay saved in Orders.</p></div>
        </div>
      </section>

      <section className="cols wide-left">
        <div className="stack-s">
          <span className="eyebrow dark">Good to know</span>
          <h2>Questions people ask</h2>
          <div className="panel flat">
            {FAQ.map(([q, a]) => (
              <details className="faq" key={q}><summary>{q}</summary><p className="muted">{a}</p></details>
            ))}
          </div>
        </div>
        <div className="cta-band">
          <h2>{session ? 'Ready for your next order?' : 'Create your account in a minute'}</h2>
          <p>{session ? 'Everything you bought is saved in your orders.' : 'No fees to join. Add funds only when you are ready to buy.'}</p>
          <Link to={session ? '/products' : '/signup'} className="btn gold">{session ? 'Browse products' : 'Create account'}</Link>
        </div>
      </section>
    </>
  );
}
