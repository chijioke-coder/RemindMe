import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { dateTime, naira, STATUS_LABEL } from '../lib/format';
import type { StoreProduct } from '../components/BuyModal';
import ProductRail from '../components/ProductRail';
import AnnouncementCard from '../components/AnnouncementCard';

type Order = { id: string; product_name: string; quantity: number; total_kobo: number; status: string; created_at: string };
type Entry = { id: number; kind: string; amount_kobo: number; note: string | null; created_at: string };

export default function Account() {
  const { profile, session, balanceKobo, signOut } = useAuth();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [fresh, setFresh] = useState<StoreProduct[]>([]);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'good' | 'bad'; text: string } | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase.from('my_orders').select('*').order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => setOrders((data ?? []) as Order[]));
    supabase.from('wallet_ledger').select('id, kind, amount_kobo, note, created_at').eq('user_id', session.user.id)
      .order('created_at', { ascending: false }).limit(6)
      .then(({ data }) => setEntries((data ?? []) as Entry[]));
  }, [session, balanceKobo]);

  useEffect(() => {
    supabase.from('storefront_products').select('*').order('id', { ascending: false }).limit(10)
      .then(({ data }) => setFresh((data ?? []) as StoreProduct[]));
  }, []);

  const list = orders ?? [];
  const completed = list.filter((o) => o.status === 'completed');
  const spent = completed.reduce((a, o) => a + Number(o.total_kobo), 0);
  const refunded = list.filter((o) => o.status === 'failed' || o.status === 'refunded').length;
  const first = profile?.full_name?.trim().split(' ')[0] || profile?.email.split('@')[0] || '';

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setMsg({ kind: 'bad', text: 'Use at least 8 characters.' });
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setMsg({ kind: 'bad', text: error.message });
    else { setPw(''); setMsg({ kind: 'good', text: 'Password changed.' }); }
  }

  return (
    <>
      <div className="stack-s">
        <h1 style={{ fontSize: 'clamp(1.6rem, 5vw, 2.2rem)' }}>Hi {first}</h1>
        <p className="muted">Your orders, wallet and account in one place.</p>
      </div>

      <AnnouncementCard />

      <div className="cols">
        <div className="panel stack">
          <div className="muted">Wallet balance</div>
          <h1>{naira(balanceKobo)}</h1>
          <div className="row wrap">
            <Link to="/wallet" className="btn gold">Add funds</Link>
            <Link to="/products" className="btn ghost">Browse products</Link>
            <Link to="/referrals" className="btn ghost">Invite friends</Link>
          </div>
        </div>
        <div className="stats">
          <div className="stat"><div className="muted small">Orders</div><div className="v">{list.length}</div></div>
          <div className="stat"><div className="muted small">Completed</div><div className="v">{completed.length}</div></div>
          <div className="stat"><div className="muted small">Total spent</div><div className="v">{naira(spent)}</div></div>
          <div className="stat"><div className="muted small">Refunded</div><div className="v">{refunded}</div></div>
        </div>
      </div>

      {fresh.length > 0 && <ProductRail products={fresh} categories={[]} grouped={false} layout="carousel" title="New in the store" />}

      <div className="cols">
        <div className="panel flat">
          <div className="row between" style={{ padding: '16px 20px' }}>
            <h2>Recent orders</h2>
            <Link to="/orders">View all</Link>
          </div>
          {orders === null ? <div className="empty">Loading…</div> : list.length === 0 ? (
            <div className="empty">No orders yet. <Link to="/products">Browse products</Link></div>
          ) : (
            <div className="list" style={{ borderTop: '1px solid var(--line)' }}>
              {list.slice(0, 5).map((o) => (
                <Link key={o.id} to={`/orders/${o.id}`} className="order-row">
                  <div className="row between">
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>{o.product_name} × {o.quantity}</div>
                      <div className="muted small">{dateTime(o.created_at)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700 }}>{naira(o.total_kobo)}</div>
                      <span className={`badge ${o.status}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="panel flat">
          <div className="row between" style={{ padding: '16px 20px' }}>
            <h2>Wallet activity</h2>
            <Link to="/wallet">Full history</Link>
          </div>
          {entries.length === 0 ? <div className="empty">No transactions yet.</div> : (
            <div className="list" style={{ borderTop: '1px solid var(--line)' }}>
              {entries.map((e) => (
                <div className="row between" key={e.id}>
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{e.note || e.kind}</div>
                    <div className="muted small">{dateTime(e.created_at)}</div>
                  </div>
                  <div className={e.amount_kobo > 0 ? 'amt-plus' : 'amt-minus'}>{e.amount_kobo > 0 ? '+' : '−'}{naira(Math.abs(e.amount_kobo))}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <form className="panel stack" onSubmit={changePassword} style={{ maxWidth: 560 }}>
        <h2>Account</h2>
        <div className="muted small">Signed in as {profile?.email}</div>
        <label className="f"><span>New password</span>
          <input className="in" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" />
        </label>
        {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
        <div className="row wrap">
          <button className="btn" disabled={busy || !pw}>{busy ? 'Saving…' : 'Change password'}</button>
          <button type="button" className="btn ghost" onClick={() => signOut()}>Sign out</button>
        </div>
      </form>
    </>
  );
}
