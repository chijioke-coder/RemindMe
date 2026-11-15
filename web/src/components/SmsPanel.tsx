import { useCallback, useEffect, useRef, useState } from 'react';
import { callApi } from '../lib/supabase';
import Icon from './Icon';

type State = {
  status: string; phone: string | null; expires: string | null; items?: string[];
  listening?: boolean; now?: number; cancelFailed?: boolean;
};
type Otp = { code: string; message: string };

/** items arrive as "Code: 123456", "Message: ...": group them so each SMS is one card */
export function parseOtps(items: string[] = []): Otp[] {
  const out: Otp[] = [];
  for (const raw of items) {
    const line = raw.trim();
    if (/^code:/i.test(line)) out.push({ code: line.replace(/^code:\s*/i, ''), message: '' });
    else if (/^message:/i.test(line)) {
      const msg = line.replace(/^message:\s*/i, '');
      const last = out[out.length - 1];
      if (last && !last.message) last.message = msg; else out.push({ code: msg.match(/\b\d{4,8}\b/)?.[0] ?? '', message: msg });
    } else out.push({ code: line.match(/^\d{3,10}$/) ? line : '', message: line });
  }
  return out;
}

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.08;
    o.start(); o.stop(ctx.currentTime + 0.18);
    setTimeout(() => void ctx.close(), 400);
  } catch { /* sound is optional */ }
}

const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

export default function SmsPanel({ orderId, initial, supportUrl, onSettled }: {
  orderId: string;
  initial: { status: string; phone: string | null; expires: string | null };
  supportUrl: string | null;
  onSettled: () => void;
}) {
  const [st, setSt] = useState<State>({ ...initial });
  const [skew, setSkew] = useState(0); // server clock minus this device's clock
  const [tick, setTick] = useState(() => Date.now());
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<'cancel' | 'finish' | null>(null);
  const [notice, setNotice] = useState('');
  const seen = useRef(initial.status === 'completed' ? -1 : 0); // how many codes were already shown
  const [fresh, setFresh] = useState(-1);
  const settled = useRef(initial.status);
  const alive = useRef(true);
  const inflight = useRef(false);

  // keep asking while we wait for a first code, or while a delivered number may still get a second SMS
  const keep = useRef(initial.status === 'processing' || initial.status === 'completed');

  const apply = useCallback((r: State) => {
    if (!alive.current) return;
    if (typeof r.now === 'number') setSkew(r.now - Date.now());
    setSt((cur) => ({ ...cur, ...r }));
    keep.current = r.status === 'processing' || (r.status === 'completed' && !!r.listening);
    const codes = parseOtps(r.items).length;
    if (r.status === 'completed' && seen.current !== -1 && codes > seen.current) {
      // a new code just landed: make it impossible to miss
      setFresh(codes - 1);
      beep();
      try { navigator.vibrate?.([120, 60, 120]); } catch { /* not supported */ }
    }
    if (r.status === 'completed') seen.current = codes;
    if (r.status !== settled.current) { settled.current = r.status; onSettled(); }
  }, [onSettled]);

  // ask the server for the code every 2 seconds (every 6 when the tab is hidden)
  useEffect(() => {
    alive.current = true;
    if (!keep.current) return () => { alive.current = false; };
    let timer: ReturnType<typeof setTimeout>;
    let stop = false;
    const loop = async () => {
      if (stop) return;
      if (!inflight.current) {
        inflight.current = true;
        const r = await callApi<State>('sms_check', { order_id: orderId });
        inflight.current = false;
        if (r.ok && !stop) apply(r as unknown as State);
      }
      if (!stop && keep.current) timer = setTimeout(loop, document.visibilityState === 'visible' ? 2000 : 6000);
    };
    void loop();
    const onVis = () => { if (document.visibilityState === 'visible' && keep.current) { clearTimeout(timer); void loop(); } };
    document.addEventListener('visibilitychange', onVis);
    const c = setInterval(() => setTick(Date.now()), 1000);
    return () => { stop = true; alive.current = false; clearTimeout(timer); clearInterval(c); document.removeEventListener('visibilitychange', onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // the tab title tells people on other tabs that the code is here
  useEffect(() => {
    const base = document.title;
    if (st.status === 'completed' && fresh >= 0) document.title = '✔ Code received';
    else if (st.status === 'processing') document.title = '⏳ Waiting for code…';
    return () => { document.title = base; };
  }, [st.status, fresh]);

  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
  }

  async function cancel() {
    if (!confirm('Cancel this number and get your money back? You can only cancel before a code arrives.')) return;
    setBusy('cancel'); setNotice('');
    const r = await callApi<State>('sms_cancel', { order_id: orderId });
    setBusy(null);
    if (r.ok) {
      apply(r as unknown as State);
      if ((r as unknown as State).cancelFailed) setNotice('The number cannot be cancelled just yet. Try again in a minute. If no code arrives, you are refunded automatically.');
    } else setNotice(r.detail || 'Could not cancel. Please try again.');
  }

  async function finish() {
    setBusy('finish');
    const r = await callApi<State>('sms_finish', { order_id: orderId });
    setBusy(null);
    if (r.ok) apply(r as unknown as State);
  }

  const phone = st.phone;
  const digits = (phone ?? '').replace(/\D/g, '');
  const left = st.expires ? Math.max(0, Math.floor((new Date(st.expires).getTime() - (tick + skew)) / 1000)) : null;
  const otps = parseOtps(st.items);
  const waiting = st.status === 'processing';

  return (
    <div className="stack">
      {/* the number */}
      <div className="panel stack">
        <h2>{waiting ? 'Step 1 · Use this number' : 'Your number'}</h2>
        {phone ? (
          <div className="stack-s">
            <div className="keybox">
              <span className="mono sms-number">{phone}</span>
              <button className="btn sm gold" onClick={() => copy(phone, 'phone')}>{copied === 'phone' ? 'Copied' : 'Copy'}</button>
              <button className="btn sm ghost" onClick={() => copy(digits, 'digits')} title="Some apps want the number without the plus sign">{copied === 'digits' ? 'Copied' : 'Copy digits only'}</button>
            </div>
            {waiting && <p className="muted small">Type it into the app exactly as shown, then ask the app to send the code by SMS.</p>}
          </div>
        ) : <p className="muted">Getting your number…</p>}
      </div>

      {/* waiting */}
      {waiting && (
        <div className="panel stack">
          <h2>Step 2 · Your code appears here</h2>
          <div className="sms-wait" role="status" aria-live="polite">
            <span className="sms-pulse" aria-hidden="true" />
            <div className="grow">
              <b>Waiting for the SMS…</b>
              <div className="muted small">This page checks every 2 seconds. You do not need to refresh.</div>
            </div>
            {left !== null && <b className="sms-clock">{clock(left)}</b>}
          </div>
          {left !== null && <div className="sms-bar"><span style={{ width: `${Math.max(0, Math.min(100, (left / (20 * 60)) * 100))}%` }} /></div>}
          <ul className="sms-tips small muted">
            <li>Codes usually arrive within seconds.</li>
            <li>If the app asks, tap <b>Resend</b> after a minute. New codes show up here as well.</li>
            <li><b>No code in time? You are refunded automatically.</b></li>
          </ul>
          {notice && <div className="notice warn small">{notice}</div>}
          <div className="row wrap">
            <button className="btn ghost" disabled={busy === 'cancel'} onClick={cancel}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel and refund me'}</button>
            {supportUrl && <a className="btn ghost" href={supportUrl} target="_blank" rel="noreferrer">Contact support</a>}
          </div>
        </div>
      )}

      {/* codes */}
      {st.status === 'completed' && (
        <div className="panel stack">
          <h2>{otps.length > 1 ? 'Your codes' : 'Your code'}</h2>
          {otps.length === 0 && <p className="muted">Loading your code…</p>}
          {[...otps].reverse().map((o, i) => {
            const idx = otps.length - 1 - i;
            const isFresh = idx === fresh;
            return (
              <div className={`sms-code ${isFresh ? 'fresh' : ''}`} key={idx}>
                <div className="row between wrap">
                  <span className="muted small">{otps.length > 1 ? `SMS ${idx + 1}` : 'Verification code'}{isFresh && <span className="badge hot" style={{ marginLeft: 8 }}>New</span>}</span>
                  {o.code && <button className="btn sm gold" onClick={() => copy(o.code, `c${idx}`)}><Icon name="copy" size={15} /> {copied === `c${idx}` ? 'Copied' : 'Copy code'}</button>}
                </div>
                {o.code ? <div className="sms-digits">{o.code}</div> : null}
                {o.message && o.message !== o.code && <div className="sms-msg">{o.message}</div>}
              </div>
            );
          })}
          {st.listening && (
            <div className="sms-wait" role="status">
              <span className="sms-pulse" aria-hidden="true" />
              <div className="grow"><b>Still listening for another SMS</b><div className="muted small">If the app sends a second code, it appears above.</div></div>
            </div>
          )}
          <div className="row wrap">
            {st.listening && <button className="btn" disabled={busy === 'finish'} onClick={finish}>{busy === 'finish' ? 'Saving…' : 'I am done'}</button>}
            <button className="btn ghost" onClick={() => copy(otps.map((o) => o.message || o.code).join('\n'), 'all')}>{copied === 'all' ? 'Copied' : 'Copy everything'}</button>
          </div>
          <p className="muted small">Your codes stay on this page. Open the order from “My orders” any time.</p>
        </div>
      )}
    </div>
  );
}
