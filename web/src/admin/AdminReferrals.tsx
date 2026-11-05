import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { dateOnly, dateTime, naira } from '../lib/format';
import Icon from '../components/Icon';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8))).map((b) => ALPHABET[b % ALPHABET.length]).join('');

export default function AdminReferrals() {
  const [s, setS] = useState<any | null>(null);
  const [promos, setPromos] = useState<any[]>([]);
  const [refs, setRefs] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [np, setNp] = useState({ code: '', bonus: '', max: '', expires: '', note: '' });
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    const [a, b, c] = await Promise.all([
      supabase.from('referral_settings').select('*').eq('id', 1).single(),
      supabase.from('promo_codes').select('*').order('id', { ascending: false }),
      supabase.from('referrals').select('*').order('created_at', { ascending: false }).limit(100),
    ]);
    if (a.data) setS({ ...a.data, referrer_naira: a.data.referrer_reward_kobo / 100, referee_naira: a.data.referee_reward_kobo / 100, min_naira: a.data.min_amount_kobo / 100 });
    setPromos(b.data ?? []);
    setRefs(c.data ?? []);
  }
  useEffect(() => { void load(); }, []);
  if (!s) return <p className="muted">Loading…</p>;
  const set = (k: string, v: unknown) => setS({ ...s, [k]: v });

  async function saveSettings() {
    setBusy(true);
    const { error } = await supabase.from('referral_settings').update({
      enabled: s.enabled,
      reward_enabled: s.reward_enabled,
      referrer_reward_kobo: Math.round(Number(s.referrer_naira || 0) * 100),
      referee_reward_kobo: Math.round(Number(s.referee_naira || 0) * 100),
      condition: s.condition,
      min_amount_kobo: Math.round(Number(s.min_naira || 0) * 100),
      terms: s.terms || null,
    }).eq('id', 1);
    setBusy(false);
    setMsg(error ? { kind: 'bad', text: error.message } : { kind: 'good', text: 'Referral program saved.' });
  }

  async function createPromo() {
    const bonus = Math.round(Number(np.bonus) * 100);
    const code = (np.code.trim() || makeCode()).toUpperCase().replace(/\s+/g, '');
    if (!(bonus > 0)) return setMsg({ kind: 'bad', text: 'Enter the bonus amount in naira.' });
    setBusy(true);
    const { error } = await supabase.from('promo_codes').insert({
      code, bonus_kobo: bonus,
      max_uses: np.max ? Number(np.max) : null,
      expires_at: np.expires ? new Date(`${np.expires}T23:59:59`).toISOString() : null,
      note: np.note || null,
    });
    setBusy(false);
    if (error) return setMsg({ kind: 'bad', text: error.message.includes('duplicate') ? 'That code already exists. Try another.' : error.message });
    setNp({ code: '', bonus: '', max: '', expires: '', note: '' });
    setMsg({ kind: 'good', text: `Promo code ${code} created. Share the link next to it, or the code itself.` });
    await load();
  }

  async function togglePromo(p: any) {
    await supabase.from('promo_codes').update({ is_active: !p.is_active }).eq('id', p.id);
    await load();
  }
  async function deletePromo(p: any) {
    if (!confirm(`Delete promo code ${p.code}? People who already used it keep their bonus.`)) return;
    await supabase.from('promo_codes').delete().eq('id', p.id);
    await load();
  }
  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
  }

  const paid = refs.filter((r) => r.status === 'rewarded');
  const paidTotal = paid.reduce((a, r) => a + Number(r.reward_kobo), 0);
  const used = promos.reduce((a, p) => a + Number(p.uses), 0);

  return (
    <>
      <h1 style={{ fontSize: 'clamp(1.5rem, 4.5vw, 1.9rem)' }}>Referrals and promo codes</h1>
      {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}

      <div className="stats">
        <div className="stat"><div className="muted small">Friends invited</div><div className="v">{refs.length}</div></div>
        <div className="stat"><div className="muted small">Rewarded</div><div className="v">{paid.length}</div></div>
        <div className="stat"><div className="muted small">Referral rewards paid</div><div className="v">{naira(paidTotal)}</div></div>
        <div className="stat"><div className="muted small">Promo codes used</div><div className="v">{used}</div></div>
      </div>

      <div className="cols">
        <div className="panel stack">
          <h2>Referral program</h2>
          <label className="check"><input type="checkbox" checked={s.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Program is on (record invites)</label>
          <label className="check"><input type="checkbox" checked={s.reward_enabled} onChange={(e) => set('reward_enabled', e.target.checked)} /> Pay rewards (leave off for now)</label>
          <div className="grid2">
            <label className="f"><span>Reward for the person who invites (₦)</span><input className="in" inputMode="decimal" value={s.referrer_naira} onChange={(e) => set('referrer_naira', e.target.value)} /></label>
            <label className="f"><span>Reward for the new friend (₦)</span><input className="in" inputMode="decimal" value={s.referee_naira} onChange={(e) => set('referee_naira', e.target.value)} /></label>
          </div>
          <label className="f"><span>The reward is paid when the friend…</span>
            <select className="in" value={s.condition} onChange={(e) => set('condition', e.target.value)}>
              <option value="signup">signs up</option>
              <option value="first_topup">adds funds to their wallet</option>
              <option value="first_purchase">makes a purchase</option>
            </select></label>
          <label className="f"><span>Minimum amount for that to count (₦, 0 = any)</span><input className="in" inputMode="decimal" value={s.min_naira} onChange={(e) => set('min_naira', e.target.value)} /></label>
          <label className="f"><span>Terms shown to customers (optional)</span><textarea className="in" value={s.terms ?? ''} onChange={(e) => set('terms', e.target.value)} placeholder="e.g. One reward per friend. Rewards are added to your wallet." /></label>
          <button className="btn block" disabled={busy} onClick={saveSettings}>Save program</button>
          <p className="muted small">With rewards off, invites are still counted and shown to customers, but nothing is paid. When you switch rewards on, they apply to friends who join from then on.</p>
        </div>

        <div className="panel stack">
          <h2>Create a promo code</h2>
          <p className="muted small">Anyone who signs up with the code gets the bonus in their wallet straight away.</p>
          <div className="grid2">
            <label className="f"><span>Code (blank = make one for me)</span><input className="in" value={np.code} onChange={(e) => setNp({ ...np, code: e.target.value.toUpperCase() })} /></label>
            <label className="f"><span>Bonus (₦)</span><input className="in" inputMode="decimal" value={np.bonus} onChange={(e) => setNp({ ...np, bonus: e.target.value })} /></label>
            <label className="f"><span>Most people who can use it (blank = unlimited)</span><input className="in" inputMode="numeric" value={np.max} onChange={(e) => setNp({ ...np, max: e.target.value })} /></label>
            <label className="f"><span>Last day it works (optional)</span><input className="in" type="date" value={np.expires} onChange={(e) => setNp({ ...np, expires: e.target.value })} /></label>
          </div>
          <label className="f"><span>Note to yourself (optional)</span><input className="in" value={np.note} onChange={(e) => setNp({ ...np, note: e.target.value })} /></label>
          <button className="btn block" disabled={busy} onClick={createPromo}>Create promo code</button>
          <p className="muted small">Set a limit and an end date. A code with no limit can be shared widely and used by many new accounts.</p>
        </div>
      </div>

      <div className="panel flat">
        <div className="board-head">Promo codes</div>
        {promos.length === 0 ? <div className="empty">No promo codes yet.</div> : (
          <div className="list">
            {promos.map((p) => {
              const link = `${window.location.origin}/signup?ref=${p.code}`;
              const expired = p.expires_at && new Date(p.expires_at) < new Date();
              const full = p.max_uses != null && p.uses >= p.max_uses;
              return (
                <div key={p.id} className="stack-s">
                  <div className="row between">
                    <div className="grow">
                      <b className="mono" style={{ fontSize: '1.02rem' }}>{p.code}</b> <span className="badge on">{naira(p.bonus_kobo)} bonus</span>
                      {expired && <span className="badge off">Expired</span>} {full && <span className="badge off">Fully used</span>}
                      <div className="muted small">Used {p.uses}{p.max_uses != null ? ` of ${p.max_uses}` : ''} · {p.expires_at ? `ends ${dateOnly(p.expires_at)}` : 'no end date'}{p.note ? ` · ${p.note}` : ''}</div>
                    </div>
                    <button className={`toggle ${p.is_active ? 'on' : ''}`} aria-label="Active" onClick={() => togglePromo(p)} />
                  </div>
                  <div className="row wrap">
                    <button className="btn sm ghost" onClick={() => copy(link, `l${p.id}`)}><Icon name="link" size={16} />{copied === `l${p.id}` ? 'Copied' : 'Copy signup link'}</button>
                    <button className="btn sm ghost" onClick={() => copy(p.code, `c${p.id}`)}><Icon name="copy" size={16} />{copied === `c${p.id}` ? 'Copied' : 'Copy code'}</button>
                    <button className="btn sm ghost" onClick={() => deletePromo(p)}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel flat">
        <div className="board-head">Recent invites</div>
        {refs.length === 0 ? <div className="empty">No invites yet.</div> : (
          <div className="list">
            {refs.map((r) => (
              <div key={r.id} className="row between">
                <div className="grow"><b>{r.referee_email}</b><div className="muted small">invited by {r.referrer_email} · {dateTime(r.created_at)}</div></div>
                <span className={`badge ${r.status === 'rewarded' ? 'on' : ''}`}>{r.status === 'rewarded' ? `Rewarded ${naira(r.reward_kobo)}` : 'Joined'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
