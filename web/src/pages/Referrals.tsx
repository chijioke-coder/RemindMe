import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { dateOnly, naira } from '../lib/format';
import Icon from '../components/Icon';

type Rules = { enabled: boolean; reward_enabled: boolean; referrer_reward_kobo: number; referee_reward_kobo: number; condition: string; min_amount_kobo: number; terms: string | null };
type Friend = { id: number; friend: string; status: string; reward_kobo: number; created_at: string };

const WHEN: Record<string, string> = { signup: 'signs up', first_topup: 'adds funds to their wallet', first_purchase: 'makes their first purchase' };

export default function Referrals() {
  const { profile } = useAuth();
  const [rules, setRules] = useState<Rules | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase.from('public_referral').select('*').maybeSingle().then(({ data }) => setRules(data as Rules | null));
    supabase.from('my_referrals').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setFriends((data ?? []) as Friend[]));
  }, []);

  const code = (profile as unknown as { referral_code?: string | null } | null)?.referral_code ?? '';
  const link = code ? `${window.location.origin}/signup?ref=${code}` : '';
  const shareText = 'Join me on PaBs Media: verified accounts and digital products, delivered to your account. ';
  const earned = friends.filter((f) => f.status === 'rewarded').reduce((a, f) => a + Number(f.reward_kobo), 0);
  const rewarded = friends.filter((f) => f.status === 'rewarded').length;

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  }

  return (
    <>
      <div className="invite">
        <span className="eyebrow">Invite friends</span>
        <h1>Share PaBs Media with your friends</h1>
        <p>Send your personal link. When a friend creates an account with it, they are linked to you automatically.</p>
        {link ? (
          <>
            <div className="linkbox">
              <input readOnly value={link} aria-label="Your invite link" onFocus={(e) => e.currentTarget.select()} />
              <button className="btn sm gold" onClick={copy}><Icon name="copy" size={16} />{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <div className="row wrap">
              <a className="btn light" href={`https://wa.me/?text=${encodeURIComponent(shareText + link)}`} target="_blank" rel="noreferrer"><Icon name="share" size={18} />Share on WhatsApp</a>
              <span className="small" style={{ color: '#d5efe9' }}>Your code: <b>{code}</b></span>
            </div>
          </>
        ) : <p>Your invite link is being prepared. Please reload in a moment.</p>}
      </div>

      <div className="stats">
        <div className="stat"><div className="muted small">Friends joined</div><div className="v">{friends.length}</div></div>
        <div className="stat"><div className="muted small">Rewarded</div><div className="v">{rewarded}</div></div>
        <div className="stat"><div className="muted small">Rewards earned</div><div className="v">{naira(earned)}</div></div>
      </div>

      <div className="cols">
        <div className="panel stack">
          <h2>How it works</h2>
          <ol style={{ margin: 0, paddingLeft: 20 }} className="stack-s">
            <li>Copy your link and send it to a friend.</li>
            <li>They create an account using your link.</li>
            <li>You can see them in your list as soon as they join.</li>
          </ol>
          {rules && !rules.reward_enabled && (
            <div className="notice warn">There is no reward yet. Invites are being recorded, and rewards may be added later.</div>
          )}
          {rules && rules.reward_enabled && (
            <div className="notice good">
              {rules.referrer_reward_kobo > 0 && <>You earn <b>{naira(rules.referrer_reward_kobo)}</b> when a friend {WHEN[rules.condition] ?? 'qualifies'}{rules.min_amount_kobo > 0 ? ` (minimum ${naira(rules.min_amount_kobo)})` : ''}. </>}
              {rules.referee_reward_kobo > 0 && <>Your friend gets <b>{naira(rules.referee_reward_kobo)}</b> too.</>}
            </div>
          )}
          {rules?.terms && <p className="muted small" style={{ whiteSpace: 'pre-wrap' }}>{rules.terms}</p>}
        </div>

        <div className="panel flat">
          <div className="board-head">Your invited friends</div>
          {friends.length === 0 ? <div className="empty">Nobody has joined with your link yet.</div> : (
            <div className="list">
              {friends.map((f) => (
                <div className="row between" key={f.id}>
                  <div className="grow"><b>{f.friend}</b><div className="muted small">Joined {dateOnly(f.created_at)}</div></div>
                  <span className={`badge ${f.status === 'rewarded' ? 'on' : ''}`}>{f.status === 'rewarded' ? `Rewarded ${naira(f.reward_kobo)}` : 'Joined'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
