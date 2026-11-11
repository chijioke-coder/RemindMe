import { useEffect, useRef, useState } from 'react';
import { callApi, supabase } from '../lib/supabase';
import { naira } from '../lib/format';

type Sync = { running: boolean; done: number; total: number; offers: number; failed: number; error: string };

export default function AdminNumbers() {
  const [s, setS] = useState<any | null>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [fsInfo, setFsInfo] = useState<{ kind: string; text: string } | null>(null);
  const [sync, setSync] = useState<Sync>({ running: false, done: 0, total: 0, offers: 0, failed: 0, error: '' });
  const stop = useRef(false);
  const [svcQ, setSvcQ] = useState('');
  const [ctyQ, setCtyQ] = useState('');
  const [services, setServices] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [counts, setCounts] = useState<{ total: number; shown: number; svc: number; cty: number }>({ total: 0, shown: 0, svc: 0, cty: 0 });

  async function loadSettings() {
    const { data } = await supabase.from('app_settings')
      .select('sms_show, sms_rate_naira, sms_markup_percent, sms_min_rate').eq('id', 1).single();
    if (data) setS(data);
  }
  async function loadLists() {
    const sq = supabase.from('sms_services').select('*').order('is_active', { ascending: false }).order('name').limit(100);
    const cq = supabase.from('sms_countries').select('*').order('is_active', { ascending: false }).order('name').limit(100);
    const [a, b] = await Promise.all([svcQ.trim() ? sq.ilike('name', `%${svcQ.trim()}%`) : sq, ctyQ.trim() ? cq.ilike('name', `%${ctyQ.trim()}%`) : cq]);
    setServices(a.data ?? []);
    setCountries(b.data ?? []);
  }
  async function loadCounts() {
    const [t, v, sv, ct] = await Promise.all([
      supabase.from('sms_offers').select('*', { count: 'exact', head: true }),
      supabase.from('storefront_sms').select('*', { count: 'exact', head: true }),
      supabase.from('sms_services').select('*', { count: 'exact', head: true }),
      supabase.from('sms_countries').select('*', { count: 'exact', head: true }),
    ]);
    setCounts({ total: t.count ?? 0, shown: v.count ?? 0, svc: sv.count ?? 0, cty: ct.count ?? 0 });
  }
  useEffect(() => { void loadSettings(); void loadCounts(); void callApi('sms_sweep'); }, []);
  useEffect(() => { const t = setTimeout(() => void loadLists(), 250); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [svcQ, ctyQ]);
  if (!s) return <p className="muted">Loading…</p>;
  const set = (k: string, v: unknown) => setS({ ...s, [k]: v });

  async function saveSettings() {
    const rate = Number(s.sms_rate_naira);
    if (s.sms_show && !(rate > 0)) return setMsg({ kind: 'bad', text: 'Enter how many naira one 5sim unit costs you before switching virtual numbers on.' });
    const { error } = await supabase.from('app_settings').update({
      sms_show: !!s.sms_show,
      sms_rate_naira: rate || 0,
      sms_markup_percent: Number(s.sms_markup_percent) || 0,
      sms_min_rate: Number(s.sms_min_rate) || 0,
    }).eq('id', 1);
    setMsg(error ? { kind: 'bad', text: error.message } : { kind: 'good', text: 'Saved. Prices in the store use these numbers right away.' });
    void loadCounts();
  }

  async function checkFiveSim() {
    setFsInfo({ kind: 'warn', text: 'Checking…' });
    const r = await callApi<any>('sms_profile');
    setFsInfo(r.ok
      ? { kind: 'good', text: `Connected. 5sim balance: ${r.balance} · rating: ${r.rating}${r.email ? ` · ${r.email}` : ''}` }
      : { kind: 'bad', text: r.detail || 'Could not reach 5sim. Check that the FIVESIM_API_KEY secret is saved.' });
  }

  async function runSync(onlyEnabled: boolean) {
    stop.current = false;
    setSync({ running: true, done: 0, total: 0, offers: 0, failed: 0, error: '' });
    const r = await callApi<{ countries: string[] }>('sms_sync_countries');
    if (!r.ok) return setSync((x) => ({ ...x, running: false, error: r.detail || 'Could not load the country list from 5sim.' }));
    let list = r.countries;
    if (onlyEnabled) {
      const { data } = await supabase.from('sms_countries').select('slug').eq('is_active', true);
      list = (data ?? []).map((c: any) => c.slug);
    }
    setSync((x) => ({ ...x, total: list.length }));
    let offers = 0, failed = 0, firstError = '';
    for (let i = 0; i < list.length; i++) {
      if (stop.current) break;
      const x = await callApi<{ offers: number }>('sms_sync_country', { country: list[i] });
      if (x.ok) offers += x.offers; else { failed++; firstError ||= x.detail || ''; }
      setSync({ running: true, done: i + 1, total: list.length, offers, failed, error: firstError });
    }
    setSync((x) => ({ ...x, running: false }));
    await Promise.all([loadLists(), loadCounts()]);
  }

  async function toggle(table: 'sms_services' | 'sms_countries', row: any) {
    await supabase.from(table).update({ is_active: !row.is_active }).eq('slug', row.slug);
    const set = table === 'sms_services' ? setServices : setCountries;
    set((rows) => rows.map((r) => (r.slug === row.slug ? { ...r, is_active: !r.is_active } : r)));
    void loadCounts();
  }
  async function bulk(table: 'sms_services' | 'sms_countries', rows: any[], on: boolean) {
    if (!rows.length) return;
    await supabase.from(table).update({ is_active: on }).in('slug', rows.map((r) => r.slug));
    await Promise.all([loadLists(), loadCounts()]);
  }

  const pct = sync.total ? Math.round((sync.done / sync.total) * 100) : 0;

  return (
    <>
      <h1 style={{ fontSize: 'clamp(1.5rem, 4.5vw, 1.9rem)' }}>Virtual numbers (5sim)</h1>
      {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}

      <div className="stats">
        <div className="stat"><div className="muted small">Offers synced</div><div className="v">{counts.total.toLocaleString()}</div></div>
        <div className="stat"><div className="muted small">Showing in the store</div><div className="v">{counts.shown.toLocaleString()}</div></div>
        <div className="stat"><div className="muted small">Apps found</div><div className="v">{counts.svc.toLocaleString()}</div></div>
        <div className="stat"><div className="muted small">Countries found</div><div className="v">{counts.cty.toLocaleString()}</div></div>
      </div>

      <div className="cols">
        <div className="panel stack">
          <h2>1. Connect and set prices</h2>
          <p className="muted small">Add your 5sim API key as the secret <b>FIVESIM_API_KEY</b> in Supabase → Edge Functions → Secrets. It stays on the server.</p>
          <div className="row wrap">
            <button className="btn ghost" onClick={checkFiveSim}>Check the connection</button>
            <button className="btn ghost" onClick={async () => { const r = await callApi<any>('sms_sweep'); setMsg(r.ok ? { kind: 'good', text: `Checked ${r.checked} waiting number orders. Any that expired were refunded.` } : { kind: 'bad', text: r.detail || 'Could not check.' }); }}>Check waiting orders now</button>
          </div>
          {fsInfo && <div className={`notice ${fsInfo.kind} small`}>{fsInfo.text}</div>}
          <label className="f"><span>Naira that one 5sim unit costs you</span>
            <input className="in" inputMode="decimal" value={s.sms_rate_naira} onChange={(e) => set('sms_rate_naira', e.target.value)} placeholder="e.g. 20" /></label>
          <p className="muted small">5sim prices are not in naira. Look at your 5sim balance, work out how many naira one unit of it costs you to buy, and enter that. Update it when the rate moves.</p>
          <div className="grid2">
            <label className="f"><span>Your markup %</span><input className="in" inputMode="decimal" value={s.sms_markup_percent} onChange={(e) => set('sms_markup_percent', e.target.value)} /></label>
            <label className="f"><span>Hide numbers below this success % (0 = show all)</span><input className="in" inputMode="decimal" value={s.sms_min_rate} onChange={(e) => set('sms_min_rate', e.target.value)} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={!!s.sms_show} onChange={(e) => set('sms_show', e.target.checked)} /> Show virtual numbers in the store (alongside the other products)</label>
          <button className="btn block" onClick={saveSettings}>Save</button>
        </div>

        <div className="panel stack">
          <h2>2. Sync everything 5sim has</h2>
          <p className="muted small">This loads every app and country that 5sim sells right now, with stock and prices. New apps and countries stay hidden until you switch them on below. Keep this page open while it runs (a few minutes for everything).</p>
          <div className="row wrap">
            <button className="btn" disabled={sync.running} onClick={() => runSync(false)}>Sync all 5sim products</button>
            <button className="btn ghost" disabled={sync.running} onClick={() => runSync(true)}>Refresh enabled countries only</button>
            {sync.running && <button className="btn ghost" onClick={() => { stop.current = true; }}>Stop</button>}
          </div>
          {(sync.running || sync.done > 0) && (
            <div className="stack-s">
              <div style={{ height: 10, background: 'var(--mist)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--teal)', transition: 'width .3s' }} />
              </div>
              <p className="small muted">{sync.done} of {sync.total} countries · {sync.offers.toLocaleString()} offers{sync.failed ? ` · ${sync.failed} failed` : ''}{sync.running ? '' : ' · finished'}</p>
            </div>
          )}
          {sync.error && <div className="notice bad small">{sync.error}</div>}
          <p className="muted small">Tip: after the first full sync, use “Refresh enabled countries only” to keep stock and prices fresh quickly.</p>
        </div>
      </div>

      <div className="cols">
        <div className="panel stack">
          <h2>3. Apps to show</h2>
          <input className="in" placeholder="Search apps, e.g. whatsapp" value={svcQ} onChange={(e) => setSvcQ(e.target.value)} />
          <div className="row wrap">
            <button className="btn sm ghost" onClick={() => bulk('sms_services', services, true)}>Show all listed</button>
            <button className="btn sm ghost" onClick={() => bulk('sms_services', services, false)}>Hide all listed</button>
          </div>
          <div className="list" style={{ border: '1px solid var(--line)', borderRadius: 12, maxHeight: 420, overflowY: 'auto' }}>
            {services.map((r) => (
              <div key={r.slug} className="row between">
                <span>{r.name} <span className="muted small">{r.slug !== r.name.toLowerCase() ? r.slug : ''}</span></span>
                <button className={`toggle ${r.is_active ? 'on' : ''}`} aria-label={`Show ${r.name}`} onClick={() => toggle('sms_services', r)} />
              </div>
            ))}
            {services.length === 0 && <div className="empty">Sync first, then your apps appear here.</div>}
          </div>
          <p className="muted small">Showing the first 100 matches. Search to find others.</p>
        </div>

        <div className="panel stack">
          <h2>4. Countries to show</h2>
          <input className="in" placeholder="Search countries, e.g. usa" value={ctyQ} onChange={(e) => setCtyQ(e.target.value)} />
          <div className="row wrap">
            <button className="btn sm ghost" onClick={() => bulk('sms_countries', countries, true)}>Show all listed</button>
            <button className="btn sm ghost" onClick={() => bulk('sms_countries', countries, false)}>Hide all listed</button>
          </div>
          <div className="list" style={{ border: '1px solid var(--line)', borderRadius: 12, maxHeight: 420, overflowY: 'auto' }}>
            {countries.map((r) => (
              <div key={r.slug} className="row between">
                <span>{r.name} <span className="muted small">{r.prefix ?? ''}</span></span>
                <button className={`toggle ${r.is_active ? 'on' : ''}`} aria-label={`Show ${r.name}`} onClick={() => toggle('sms_countries', r)} />
              </div>
            ))}
            {countries.length === 0 && <div className="empty">Sync first, then your countries appear here.</div>}
          </div>
          <p className="muted small">A number appears in the store only when both its app and its country are switched on, and 5sim has stock. Prices look like {naira(Math.ceil((Number(s.sms_rate_naira || 0) * 5 * 100 * (1 + Number(s.sms_markup_percent || 0) / 100)) / 1000) * 1000)} for a 5-unit number at your current settings.</p>
        </div>
      </div>
    </>
  );
}
