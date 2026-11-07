import { useEffect, useState } from 'react';
import { callApi } from '../lib/supabase';
import Linkify from './Linkify';

const isLink = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

export default function KeyList({ orderId, autoLoad = false }: { orderId: string; autoLoad?: boolean }) {
  const [keys, setKeys] = useState<string[] | null>(null);
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<number | null>(null);

  async function load() {
    setBusy(true);
    setError('');
    const r = await callApi<{ keys: string[]; files: { name: string; url: string }[] }>('order_keys', { order_id: orderId });
    setBusy(false);
    if (r.ok) { setKeys(r.keys); setFiles(r.files ?? []); } else setError(r.detail || 'Could not load your details.');
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
          <span className="mono"><Linkify text={k} /></span>
          {isLink(k) && <a className="btn sm" href={k} target="_blank" rel="noreferrer noopener">Open</a>}
          <button className="btn sm gold" onClick={() => copy(k, i)}>{copied === i ? 'Copied' : 'Copy'}</button>
        </div>
      ))}
      {files.map((f) => (
        <div className="keybox" key={f.url}>
          <span className="mono">📎 {f.name}</span>
          <a className="btn sm gold" href={f.url} target="_blank" rel="noreferrer" download={f.name}>Download</a>
        </div>
      ))}
      {keys.length === 0 && files.length === 0 && <p className="muted small">Nothing to show for this order.</p>}
      {files.length > 0 && <p className="muted small">Download links are private and expire after 15 minutes. Reopen this order for a fresh link.</p>}
    </div>
  );
}
