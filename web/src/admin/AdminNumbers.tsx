import { useEffect, useRef, useState } from 'react';
import { callApi, supabase } from '../lib/supabase';

export default function AdminNumbers() {
  const [s, setS] = useState<any | null>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [heroInfo, setHeroInfo] = useState<{ kind: string; text: string } | null>(null);
  const [heroBusy, setHeroBusy] = useState(false);
  const heroTimer = useRef<ReturnType<typeof setTimeout>>();
  const [svcQ, setSvcQ] = useState('');
  const [ctyQ, setCtyQ] = useState('');
  const [services, setServices] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [counts, setCounts] = useState<{ total: number; shown: number; svc: number; cty: number }>({ total: 0, shown: 0, svc: 0, cty: 0 });

  async function loadSettings() {
    const { data } = await supabase.from('app_settings')
      .select('sms_show, sms_markup_percent, sms_min_rate, hero_rate_naira, hero_last_sync_at').eq('id', 1).single();
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
    const hero = Number(s.hero_rate_naira);
    if (s.sms_show && !(hero > 0)) return setMsg({ kind: 'bad', text: 'Enter how many naira one US dollar costs you before switching virtual numbers on.' });
    const { error } = await supabase.from('app_settings').update({
      sms_show: !!s.sms_show,
      sms_rate_naira: 1, // prices are stored in naira already: the shared base unit stays at 1
      sms_markup_percent: Number(s.sms_markup_percent) || 0,
      sms_min_rate: Number(s.sms_min_rate) || 0,
      hero_rate_naira: hero || 0,
    }).eq('id', 1);
    setMsg(error ? { kind: 'bad', text: error.message } : { kind: 'good', text: 'Saved. Prices update on the next refresh (press the refresh button, or wait a few minutes).' });
    void loadCounts();
  }

  async function checkHero() {
    setHeroInfo({ kind: 'warn', text: 'Checking…' });
    const r = await callApi<any>('hero_profile');
    setHeroInfo(r.ok
      ? { kind: 'good', text: `Connected. HeroSMS balance: $${r.balance}` }
      : { kind: 'bad', text: r.detail || 'Could not reach HeroSMS. Check that the HEROSMS_API_KEY secret is saved.' });
  }

  async function syncHero() {
    setHeroBusy(true);
    setHeroInfo({ kind: 'warn', text: 'Loading the HeroSMS catalogue…' });
    const r = await callApi<any>('hero_sync');
    setHeroBusy(false);
    if (!r.ok) { setHeroInfo({ kind: 'bad', text: r.detail || 'Could not load HeroSMS.' }); return; }
    const bits = [`${r.apps} apps in ${r.countries} countries on HeroSMS`, `${r.offers} offers now in your store`];
    if (r.rate_missing) bits.push('Enter the naira-per-dollar rate and save, or nothing can be priced');
    else if (r.found > 0 && r.offers === 0) bits.push('Switch on the apps and countries you want below, then refresh again');
    if (r.names_missing) bits.push('HeroSMS did not send names for some items, so they show by code');
    setHeroInfo({ kind: r.rate_missing ? 'bad' : 'good', text: bits.join('. ') + '.' });
    await Promise.all([loadLists(), loadCounts(), loadSettings()]);
  }

  async function toggle(table: 'sms_services' | 'sms_countries', row: any) {
    await supabase.from(table).update({ is_active: !row.is_active }).eq('slug', row.slug);
    const setRows = table === 'sms_services' ? setServices : setCountries;
    setRows((rows) => rows.map((r) => (r.slug === row.slug ? { ...r, is_active: !r.is_active } : r)));
    void loadCounts();
    queueHero();
  }
  async function bulk(table: 'sms_services' | 'sms_countries', rows: any[], on: boolean) {
    if (!rows.length) return;
    await supabase.from(table).update({ is_active: on }).in('slug', rows.map((r) => r.slug));
    await Promise.all([loadLists(), loadCounts()]);
    queueHero();
  }

  /** switching things on or off changes which prices we keep: refresh them shortly after the last click */
  function queueHero() {
    if (!(Number(s.hero_rate_naira) > 0)) return;
    clearTimeout(heroTimer.current);
    heroTimer.current = setTimeout(() => void syncHero(), 2500);
  }

  return (
    <>
      <h1 style={{ fontSize: 'clamp(1.5rem, 4.5vw, 1.9rem)' }}>Virtual numbers (HeroSMS)</h1>
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
          <p className="muted small">Add your HeroSMS API key as the secret <b>HEROSMS_API_KEY</b> in Supabase → Edge Functions → Secrets. It stays on the server. HeroSMS charges in US dollars, so tell the store what one dollar costs you in naira. Prices and stock refresh by themselves every few minutes.</p>
          <label className="f"><span>Naira that one US dollar costs you</span>
            <input className="in" inputMode="decimal" value={s.hero_rate_naira ?? ''} onChange={(e) => set('hero_rate_naira', e.target.value)} placeholder="e.g. 1600" /></label>
          <div className="grid2">
            <label className="f"><span>Your markup %</span><input className="in" inputMode="decimal" value={s.sms_markup_percent} onChange={(e) => set('sms_markup_percent', e.target.value)} /></label>
            <label className="f"><span>Hide numbers below this success % (0 = show all)</span><input className="in" inputMode="decimal" value={s.sms_min_rate} onChange={(e) => set('sms_min_rate', e.target.value)} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={!!s.sms_show} onChange={(e) => set('sms_show', e.target.checked)} /> Show virtual numbers in the store (alongside the other products)</label>
          <div className="row wrap">
            <button className="btn ghost" onClick={checkHero}>Check the connection</button>
            <button className="btn" disabled={heroBusy} onClick={async () => { await saveSettings(); await syncHero(); }}>{heroBusy ? 'Refreshing…' : 'Save and refresh prices'}</button>
            <button className="btn ghost" onClick={async () => { const r = await callApi<any>('sms_sweep'); setMsg(r.ok ? { kind: 'good', text: `Checked ${r.checked} waiting number orders. Any that expired were refunded.` } : { kind: 'bad', text: r.detail || 'Could not check.' }); }}>Check waiting orders now</button>
          </div>
          {heroInfo && <div className={`notice ${heroInfo.kind} small`}>{heroInfo.text}</div>}
          <p className="muted small">Last refreshed: <b>{s.hero_last_sync_at ? new Date(s.hero_last_sync_at).toLocaleString('en-NG') : 'never'}</b></p>
        </div>

        <div className="panel stack">
          <h2>How it works</h2>
          <p className="muted small">The first refresh loads every app and country HeroSMS sells. They stay hidden until you switch them on in the lists below. After each switch the prices and stock for what you enabled are loaded automatically.</p>
          <p className="muted small">Customers pay your price (HeroSMS dollar price × your rate × your markup). If no code arrives before the number expires, the customer is refunded automatically.</p>
        </div>
      </div>

      <div className="cols">
        <div className="panel stack">
          <h2>2. Apps to show</h2>
          <input className="in" placeholder="Search apps, e.g. whatsapp" value={svcQ} onChange={(e) => setSvcQ(e.target.value)} />
          <div className="row wrap">
            <button className="btn sm ghost" onClick={() => bulk('sms_services', services, true)}>Show all listed</button>
            <button className="btn sm ghost" onClick={() => bulk('sms_services', services, false)}>Hide all listed</button>
          </div>
          <div className="list" style={{ border: '1px solid var(--line)', borderRadius: 12, maxHeight: 420, overflowY: 'auto' }}>
            {services.map((r) => (
              <div key={r.slug} className="row between">
                <span>{r.name}</span>
                <button className={`toggle ${r.is_active ? 'on' : ''}`} aria-label={`Show ${r.name}`} onClick={() => toggle('sms_services', r)} />
              </div>
            ))}
            {services.length === 0 && <div className="empty">Refresh first, then your apps appear here.</div>}
          </div>
          <p className="muted small">Showing the first 100 matches. Search to find others.</p>
        </div>

        <div className="panel stack">
          <h2>3. Countries to show</h2>
          <input className="in" placeholder="Search countries, e.g. usa" value={ctyQ} onChange={(e) => setCtyQ(e.target.value)} />
          <div className="row wrap">
            <button className="btn sm ghost" onClick={() => bulk('sms_countries', countries, true)}>Show all listed</button>
            <button className="btn sm ghost" onClick={() => bulk('sms_countries', countries, false)}>Hide all listed</button>
          </div>
          <div className="list" style={{ border: '1px solid var(--line)', borderRadius: 12, maxHeight: 420, overflowY: 'auto' }}>
            {countries.map((r) => (
              <div key={r.slug} className="row between">
                <span>{r.name}</span>
                <button className={`toggle ${r.is_active ? 'on' : ''}`} aria-label={`Show ${r.name}`} onClick={() => toggle('sms_countries', r)} />
              </div>
            ))}
            {countries.length === 0 && <div className="empty">Refresh first, then your countries appear here.</div>}
          </div>
          <p className="muted small">A number appears in the store only when both its app and its country are switched on and HeroSMS has stock.</p>
        </div>
      </div>
    </>
  );
}
