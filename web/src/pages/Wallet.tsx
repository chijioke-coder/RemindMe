import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { callApi, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { dateTime, naira } from '../lib/format';

type Entry = { id: number; kind: string; amount_kobo: number; balance_after_kobo: number; note: string | null; created_at: string };

export default function Wallet() {
  const { session, balanceKobo, refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [amount, setAmount] = useState('2000');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'good' | 'bad' | 'warn'; text: string } | null>(null);

  const loadEntries = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase.from('wallet_ledger').select('*').eq('user_id', session.user.id)
      .order('created_at', { ascending: false }).limit(30);
    setEntries((data ?? []) as Entry[]);
  }, [session]);

  // returning from Paystack: confirm the payment
  useEffect(() => {
    const ref = params.get('reference') || params.get('trxref');
    if (!ref) { void loadEntries(); return; }
    (async () => {
      setMsg({ kind: 'warn', text: 'Confirming your payment…' });
      const r = await callApi<{ credited: boolean; pending?: boolean }>('topup_verify', { reference: ref });
      if (r.ok && r.credited) setMsg({ kind: 'good', text: 'Payment received. Your wallet has been funded.' });
      else if (r.ok && r.pending) setMsg({ kind: 'warn', text: 'Payment not confirmed yet. Refresh in a minute; it will be credited automatically.' });
      else if (r.ok) setMsg({ kind: 'good', text: 'Payment already credited.' });
      else setMsg({ kind: 'bad', text: r.detail || 'Could not confirm the payment.' });
      setParams({}, { replace: true });
      await refresh();
      await loadEntries();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // when the balance changes by itself (a payment landed), say so and reload the history
  const prevBalance = useRef(balanceKobo);
  useEffect(() => {
    if (balanceKobo === prevBalance.current) return;
    if (balanceKobo > prevBalance.current) {
      setMsg({ kind: 'good', text: `Wallet credited ${naira(balanceKobo - prevBalance.current)}.` });
    }
    prevBalance.current = balanceKobo;
    void loadEntries();
  }, [balanceKobo, loadEntries]);

  async function fund(channel?: string) {
    setBusy(true);
    setMsg(null);
    const r = await callApi<{ url: string }>('topup_init', { amount_naira: Number(amount), channel });
    setBusy(false);
    if (r.ok) window.location.href = r.url;
    else setMsg({ kind: 'bad', text: r.detail || 'Could not start the payment.' });
  }

  return (
    <>
      <div className="panel stack">
        <div className="muted">Wallet balance</div>
        <h1>{naira(balanceKobo)}</h1>
      </div>

      <div className="cols">
      <div className="panel stack">
        <h2>Add funds</h2>
        <div className="chips">
          {['1000', '2000', '5000', '10000', '20000'].map((v) => (
            <button key={v} className={`chip ${amount === v ? 'on' : ''}`} onClick={() => setAmount(v)}>{naira(Number(v) * 100)}</button>
          ))}
        </div>
        <label className="f"><span>Amount in naira</span><input className="in" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} /></label>
        {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
        <button className="btn block" disabled={busy || Number(amount) < 500} onClick={() => fund('bank_transfer')}>{busy ? 'Opening payment…' : `Pay ${naira(Number(amount || 0) * 100)} by bank transfer`}</button>
        <button className="btn ghost block" disabled={busy || Number(amount) < 500} onClick={() => fund()}>Pay with card or other options</button>
        <p className="muted small">Minimum ₦500. With bank transfer you get a one-time account number to send to from any bank app. Your wallet is credited as soon as Paystack confirms the payment.</p>
      </div>

      <div className="panel flat">
        <div className="board-head">History</div>
        {entries.length === 0 ? <div className="empty">No transactions yet.</div> : (
          <div className="list">
            {entries.map((e) => (
              <div className="row between" key={e.id}>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{e.note || e.kind}</div>
                  <div className="muted small">{dateTime(e.created_at)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className={e.amount_kobo > 0 ? 'amt-plus' : 'amt-minus'}>{e.amount_kobo > 0 ? '+' : '−'}{naira(Math.abs(e.amount_kobo))}</div>
                  <div className="muted small">Bal {naira(e.balance_after_kobo)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </>
  );
}
