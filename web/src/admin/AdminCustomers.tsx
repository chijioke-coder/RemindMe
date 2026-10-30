import { useEffect, useState } from 'react';
import { callApi, supabase } from '../lib/supabase';
import { dateOnly, dateTime, naira, STATUS_LABEL } from '../lib/format';

const bal = (w: any) => Number((Array.isArray(w) ? w[0] : w)?.balance_kobo ?? 0);

export default function AdminCustomers() {
  const [users, setUsers] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<any | null>(null);
  const [detail, setDetail] = useState<{ ledger: any[]; orders: any[]; acts: any[] } | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);

  async function load() {
    const { data } = await supabase.from('profiles').select('*, wallets(balance_kobo)').order('created_at', { ascending: false }).limit(300);
    setUsers(data ?? []);
  }
  useEffect(() => { void load(); }, []);

  async function open(u: any) {
    setSel(u); setDetail(null); setMsg(null); setAmount(''); setNote('');
    const [l, o, a] = await Promise.all([
      supabase.from('wallet_ledger').select('*').eq('user_id', u.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('orders').select('id, product_name, quantity, total_kobo, status, created_at').eq('user_id', u.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('activity_log').select('*').eq('actor_id', u.id).order('created_at', { ascending: false }).limit(20),
    ]);
    setDetail({ ledger: l.data ?? [], orders: o.data ?? [], acts: a.data ?? [] });
  }

  async function adjust(sign: 1 | -1) {
    const n = Number(amount);
    if (!n || n < 0) return setMsg({ kind: 'bad', text: 'Enter a positive amount.' });
    const r = await callApi('wallet_adjust', { user_id: sel.id, amount_naira: sign * n, note });
    if (!r.ok) return setMsg({ kind: 'bad', text: r.detail || 'Failed.' });
    setMsg({ kind: 'good', text: 'Wallet updated.' });
    await load();
    await open({ ...sel });
  }

  async function suspend() {
    const r = await callApi('set_suspended', { user_id: sel.id, suspended: !sel.is_suspended });
    if (!r.ok) return setMsg({ kind: 'bad', text: r.detail || 'Failed.' });
    const next = { ...sel, is_suspended: !sel.is_suspended };
    setSel(next);
    await load();
  }

  const shown = users.filter((u) => !q || `${u.email} ${u.full_name ?? ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <h1 style={{ fontSize: '1.8rem' }}>Customers</h1>
      <input className="in" placeholder="Search by email or name" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="panel flat list">
        {shown.map((u) => (
          <div key={u.id} className="row between" style={{ cursor: 'pointer' }} onClick={() => open(u)}>
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{u.full_name || u.email} {u.role === 'admin' && <span className="badge hot">Admin</span>} {u.is_suspended && <span className="badge off">Suspended</span>}</div>
              <div className="muted small">{u.email} · joined {dateOnly(u.created_at)}</div>
            </div>
            <b>{naira(bal(u.wallets))}</b>
          </div>
        ))}
        {shown.length === 0 && <div className="empty">No customers found.</div>}
      </div>

      {sel && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && setSel(null)}>
          <div className="sheet stack">
            <div className="row between"><h2>{sel.full_name || sel.email}</h2><button className="btn sm ghost" onClick={() => setSel(null)}>Close</button></div>
            <p className="muted small">{sel.email}</p>
            <div className="stat"><div className="muted small">Wallet</div><div className="v">{naira(bal(users.find((u) => u.id === sel.id)?.wallets))}</div></div>

            <div className="panel stack">
              <h3>Adjust wallet</h3>
              <div className="grid2">
                <input className="in" inputMode="decimal" placeholder="Amount in ₦" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <input className="in" placeholder="Reason (kept in the record)" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div className="row"><button className="btn grow" onClick={() => adjust(1)}>Add funds</button><button className="btn danger grow" onClick={() => adjust(-1)}>Deduct</button></div>
              {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
            </div>

            {sel.role !== 'admin' && (
              <button className={`btn ${sel.is_suspended ? '' : 'danger'} block`} onClick={suspend}>
                {sel.is_suspended ? 'Restore account' : 'Suspend account'}
              </button>
            )}

            {detail && (
              <>
                <h3>Recent orders</h3>
                <div className="list">{detail.orders.map((o) => (
                  <div key={o.id} className="row between" style={{ padding: '8px 0' }}>
                    <span>{o.product_name} × {o.quantity}<div className="muted small">{dateTime(o.created_at)}</div></span>
                    <span style={{ textAlign: 'right' }}>{naira(o.total_kobo)}<div><span className={`badge ${o.status}`}>{STATUS_LABEL[o.status]}</span></div></span>
                  </div>
                ))}{detail.orders.length === 0 && <p className="muted small">None.</p>}</div>
                <h3>Wallet history</h3>
                <div className="list">{detail.ledger.map((e) => (
                  <div key={e.id} className="row between" style={{ padding: '8px 0' }}>
                    <span>{e.note || e.kind}<div className="muted small">{dateTime(e.created_at)}</div></span>
                    <span className={e.amount_kobo > 0 ? 'amt-plus' : 'amt-minus'}>{e.amount_kobo > 0 ? '+' : '−'}{naira(Math.abs(e.amount_kobo))}</span>
                  </div>
                ))}{detail.ledger.length === 0 && <p className="muted small">None.</p>}</div>
                <h3>Activity</h3>
                <div className="list">{detail.acts.map((a) => (
                  <div key={a.id} className="row between" style={{ padding: '6px 0' }}><span className="mono">{a.action}</span><span className="muted small">{dateTime(a.created_at)}</span></div>
                ))}{detail.acts.length === 0 && <p className="muted small">None.</p>}</div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
