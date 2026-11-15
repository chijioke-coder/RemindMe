import { useEffect, useState } from 'react';
import { callApi, supabase } from '../lib/supabase';
import { naira } from '../lib/format';
import { iconUrl, resizeFavicon } from '../lib/images';

export default function AdminSettings() {
  const [s, setS] = useState<any | null>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [iconBusy, setIconBusy] = useState(false);

  useEffect(() => {
    supabase.from('app_settings').select('*').eq('id', 1).single().then(({ data }) => setS(data));
  }, []);
  if (!s) return <p className="muted">Loading…</p>;
  const set = (k: string, v: unknown) => setS({ ...s, [k]: v });

  async function save() {
    const { error } = await supabase.from('app_settings').update({
      site_name: s.site_name,
      default_markup_percent: Number(s.default_markup_percent) || 0,
      purchases_paused: s.purchases_paused,
      auto_paused: false,
      pause_reason: s.pause_reason || null,
      announcement: s.announcement || null,
      support_whatsapp: s.support_whatsapp || null,
      low_balance_threshold_kobo: Math.round(Number(s.low_naira ?? s.low_balance_threshold_kobo / 100) * 100),
      alert: s.alert || null,
    }).eq('id', 1);
    setMsg(error ? { kind: 'bad', text: error.message } : { kind: 'good', text: 'Settings saved. Prices were recalculated with the new default markup.' });
  }

  // favicon: stored in the public product-icons bucket under branding/
  async function pickFavicon(file: File | undefined) {
    if (!file) return;
    setIconBusy(true);
    try {
      const blob = await resizeFavicon(file);
      const path = `branding/favicon-${crypto.randomUUID()}.png`;
      const up = await supabase.storage.from('product-icons').upload(path, blob, { contentType: 'image/png', cacheControl: '3600' });
      if (up.error) throw up.error;
      const { error } = await supabase.from('app_settings').update({ favicon_path: path }).eq('id', 1);
      if (error) throw error;
      if (s.favicon_path) await supabase.storage.from('product-icons').remove([s.favicon_path]);
      setS((cur: any) => ({ ...cur, favicon_path: path }));
      setMsg({ kind: 'good', text: 'Favicon saved. Visitors see it the next time they open the site (browsers can take a while to refresh tab icons).' });
    } catch (e: any) {
      setMsg({ kind: 'bad', text: e?.message ?? 'Could not upload the favicon.' });
    }
    setIconBusy(false);
  }

  async function removeFavicon() {
    if (!s.favicon_path) return;
    setIconBusy(true);
    await supabase.storage.from('product-icons').remove([s.favicon_path]);
    await supabase.from('app_settings').update({ favicon_path: null }).eq('id', 1);
    setS((cur: any) => ({ ...cur, favicon_path: null }));
    setIconBusy(false);
  }

  async function checkBalance() {
    const r = await callApi<any>('check_upstream');
    setMsg(r.ok ? { kind: 'good', text: `Supplier wallet: ${naira(r.balance_kobo)}` } : { kind: 'bad', text: r.detail || 'Could not reach the supplier.' });
  }

  return (
    <>
      <h1 style={{ fontSize: '1.8rem' }}>Settings</h1>
      <div className="panel stack">
        <h2>Store</h2>
        <label className="f"><span>Store name</span><input className="in" value={s.site_name} onChange={(e) => set('site_name', e.target.value)} /></label>
        <label className="f"><span>Default markup % over supplier price</span><input className="in" inputMode="decimal" value={s.default_markup_percent} onChange={(e) => set('default_markup_percent', e.target.value)} /></label>
        <label className="f"><span>Announcement card (shown on Home and My account; a link becomes a button; blank = none)</span><input className="in" value={s.announcement ?? ''} onChange={(e) => set('announcement', e.target.value)} /></label>
        <label className="f"><span>Support WhatsApp number (with country code)</span><input className="in" inputMode="tel" placeholder="2348012345678" value={s.support_whatsapp ?? ''} onChange={(e) => set('support_whatsapp', e.target.value)} /></label>
      </div>

      <div className="panel stack">
        <h2>Favicon (the small icon in the browser tab)</h2>
        <div className="row wrap">
          {iconUrl(s.favicon_path)
            ? <img src={iconUrl(s.favicon_path)!} alt="Current favicon" width={48} height={48} style={{ borderRadius: 10, background: 'var(--mist)' }} />
            : <span className="muted small">No favicon yet.</span>}
          <label className="btn ghost sm" style={{ cursor: 'pointer' }}>
            {iconBusy ? 'Uploading…' : s.favicon_path ? 'Replace image' : 'Upload image'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden disabled={iconBusy} onChange={(e) => { void pickFavicon(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {s.favicon_path && <button className="btn ghost sm" disabled={iconBusy} onClick={removeFavicon}>Remove</button>}
        </div>
        <p className="muted small">Use a square logo (the “pãBS Media” mark on its own works best). A wide banner is shrunk to fit, so it becomes too small to read in a tab. It saves as soon as you pick the file.</p>
      </div>

      <div className="panel stack">
        <h2>Purchases</h2>
        <label className="check"><input type="checkbox" checked={s.purchases_paused} onChange={(e) => set('purchases_paused', e.target.checked)} /> Pause all purchases</label>
        <label className="f"><span>Message shown while paused</span><input className="in" value={s.pause_reason ?? ''} onChange={(e) => set('pause_reason', e.target.value)} /></label>
        <label className="f"><span>Warn me when the supplier wallet drops below (₦)</span>
          <input className="in" inputMode="numeric" value={s.low_naira ?? s.low_balance_threshold_kobo / 100} onChange={(e) => set('low_naira', e.target.value)} /></label>
        <label className="f"><span>Current alert (clear it once fixed)</span><input className="in" value={s.alert ?? ''} onChange={(e) => set('alert', e.target.value)} /></label>
        <button className="btn ghost" onClick={checkBalance}>Check supplier wallet now</button>
      </div>

      {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
      <button className="btn block" onClick={save}>Save settings</button>
    </>
  );
}
