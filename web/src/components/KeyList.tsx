import { useEffect, useState } from 'react';
import { callApi } from '../lib/supabase';

export default function KeyList({ orderId, autoLoad = false }: { orderId: string; autoLoad?: boolean }) {
  const [keys, setKeys] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<number | null>(null);

  async function load() {
    setBusy(true);
    setError('');
    const r = await callApi<{ keys: string[] }>('order_keys', { order_id: orderId });
    setBusy(false);
    if (r.ok) setKeys(r.keys); else setError(r.detail || 'Could not load your details.');
  }
  useEffect(() => { if (autoLoad) void load(); /* eslint-disable-next-line */ }, [orderId]);

  async function copy(text: string, i: number) {
    try { await navigator.clipboard.writeText(text); setCopied(i); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
  }

  if (!keys) {
    return (
      <div className="stack-s">
        {error && <div className="notice bad">{error}</div>}
        <button className="btn sm" disabled={busy} onClick={load}>{busy ? 'Loading…' : 'Show my details'}</button>
      </div>
    );
  }
  return (
    <div className="stack-s">
      {keys.map((k, i) => (
        <div className="keybox" key={i}>
          <span className="mono">{k}</span>
          <button className="btn sm gold" onClick={() => copy(k, i)}>{copied === i ? 'Copied' : 'Copy'}</button>
        </div>
      ))}
    </div>
  );
}
