import { useEffect, useRef, useState } from 'react';
import { callApi, supabase } from '../lib/supabase';
import AdminNumberPrices from './AdminNumberPrices';

export default function AdminNumbers() {
  const [s, setS] = useState<any | null>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [heroInfo, setHeroInfo] = useState<{ kind: string; text: string } | null>(null);
  const [heroBusy, setHeroBusy] = useState(false);
  const [hook, setHook] = useState<{ kind: string; text: string } | null>(null);
  const heroTimer = useRef<ReturnType<typeof setTimeout>>();
  const [svcQ, setSvcQ] = useState('');
  const [ctyQ, setCtyQ] = useState('');
  const [services, setServices] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [counts, setCounts] = useState<{ total: number; shown: number; svc: number; cty: number }>({ total: 0, shown: 0, svc: 0, cty: 0 });

  async function loadSettings() {
    const { data } = await supabase.from('app_settings')
      .select('sms_show, sms_markup_percent, sms_min_rate, sms_min_profit_naira, hero_rate_naira, hero_last_sync_at, hero_rate_mode, hero_rate_margin_percent, hero_rate_market, hero_rate_source, hero_rate_updated_at').eq('id', 1).single();
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
    const auto = s.hero_rate_mode !== 'manual';
    if (!auto && s.sms_show && !(hero > 0)) { setMsg({ kind: 'bad', text: 'Enter how many naira one US dollar costs you before switching virtual numbers on.' }); return false; }
    const patch: Record<string, unknown> = {
      sms_show: !!s.sms_show,
      sms_rate_naira: 1, // prices are stored in naira already: the shared base unit stays at 1
      sms_markup_percent: Number(s.sms_markup_percent) || 0,
      sms_min_rate: Number(s.sms_min_rate) || 0,
      sms_min_profit_naira: Math.max(0, Number(s.sms_min_profit_naira) || 0),
      hero_rate_mode: auto ? 'auto' : 'manual',
      hero_rate_margin_percent: Number(s.hero_rate_margin_percent) || 0,
    };
    if (!auto) patch.hero_rate_naira = hero || 0; // in automatic mode the server keeps this number up to date
    const { error } = await supabase.from('app_settings').update(patch).eq('id', 1);
    setMsg(error ? { kind: 'bad', text: error.message } : { kind: 'good', text: 'Saved.' });
    void loadCounts();
    return !error;
  }

  /** reads the dollar rate again now (automatic mode) and reprices everything */
  async function refreshRate() {
    setHeroBusy(true);
    setHeroInfo({ kind: 'warn', text: 'Reading the dollar rate…' });
    const r = await callApi<any>('hero_rate_refresh');
    setHeroBusy(false);
    setHeroInfo(r.ok
      ? { kind: 'good', text: `Market rate ₦${Number(r.market).toLocaleString()} per $1 (${r.source}). Your rate with margin: ₦${Number(r.used).toLocaleString()}. Prices updated.` }
      : { kind: 'bad', text: r.detail || 'Could not read the rate.' });
    await Promise.all([loadSettings(), loadCounts()]);
  }

  async function showHook() {
    setHook({ kind: 'warn', text: 'Loading…' });
    const r = await callApi<any>('hero_webhook_info');
    setHook(r.ok ? { kind: 'good', text: r.url } : { kind: 'bad', text: r.detail || 'Could not get the address.' });
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
          <div className="chips">
            <button className={`chip ${s.hero_rate_mode !== 'manual' ? 'on' : ''}`} onClick={() => set('hero_rate_mode', 'auto')}>Dollar rate: automatic</button>
            <button className={`chip ${s.hero_rate_mode === 'manual' ? 'on' : ''}`} onClick={() => set('hero_rate_mode', 'manual')}>Dollar rate: I type it</button>
          </div>
          {s.hero_rate_mode === 'manual' ? (
            <label className="f"><span>Naira that one US dollar costs you</span>
              <input className="in" inputMode="decimal" value={s.hero_rate_naira ?? ''} onChange={(e) => set('hero_rate_naira', e.target.value)} placeholder="e.g. 1600" /></label>
          ) : (
            <div className="stack-s">
              <label className="f"><span>Extra margin on the market rate (%)</span>
                <input className="in" inputMode="decimal" value={s.hero_rate_margin_percent ?? 2} onChange={(e) => set('hero_rate_margin_percent', e.target.value)} /></label>
              <p className="muted small">
                {Number(s.hero_rate_market) > 0
                  ? <>Market rate now: <b>₦{Number(s.hero_rate_market).toLocaleString()}</b> per $1 ({s.hero_rate_source}). Rate used for your prices: <b>₦{Number(s.hero_rate_naira).toLocaleString()}</b>. Checked {s.hero_rate_updated_at ? new Date(s.hero_rate_updated_at).toLocaleString('en-NG') : 'never'}.</>
                  : 'No rate read yet. Press “Check the rate now”.'}
                {' '}It is read by itself every few hours from free sources. The margin covers what your bank charges when you fund HeroSMS. If the sources fail, the last rate stays.
              </p>
              <div><button className="btn ghost" disabled={heroBusy} onClick={async () => { if (await saveSettings()) await refreshRate(); }}>Check the rate now</button></div>
            </div>
          )}
          <div className="grid2">
            <label className="f"><span>Normal markup % (used when no rule fits)</span><input className="in" inputMode="decimal" value={s.sms_markup_percent} onChange={(e) => set('sms_markup_percent', e.target.value)} /></label>
            <label className="f"><span>Least profit on each number (₦)</span><input className="in" inputMode="decimal" value={s.sms_min_profit_naira ?? 0} onChange={(e) => set('sms_min_profit_naira', e.target.value)} /></label>
            <label className="f"><span>Hide numbers below this success % (0 = show all)</span><input className="in" inputMode="decimal" value={s.sms_min_rate} onChange={(e) => set('sms_min_rate', e.target.value)} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={!!s.sms_show} onChange={(e) => set('sms_show', e.target.checked)} /> Show virtual numbers in the store (alongside the other products)</label>
          <div className="row wrap">
            <button className="btn ghost" onClick={checkHero}>Check the connection</button>
            <button className="btn" disabled={heroBusy} onClick={async () => { if (await saveSettings()) { if (s.hero_rate_mode === 'manual') await syncHero(); else await refreshRate(); } }}>{heroBusy ? 'Refreshing…' : 'Save and refresh prices'}</button>
            <button className="btn ghost" onClick={async () => { const r = await callApi<any>('sms_sweep'); setMsg(r.ok ? { kind: 'good', text: `Checked ${r.checked} waiting number orders. Any that expired were refunded.` } : { kind: 'bad', text: r.detail || 'Could not check.' }); }}>Check waiting orders now</button>
          </div>
          {heroInfo && <div className={`notice ${heroInfo.kind} small`}>{heroInfo.text}</div>}
          <p className="muted small">Last refreshed: <b>{s.hero_last_sync_at ? new Date(s.hero_last_sync_at).toLocaleString('en-NG') : 'never'}</b></p>
        </div>

        <div className="panel stack">
          <h2>How it works</h2>
          <p className="muted small">The first refresh loads every app and country HeroSMS sells. They stay hidden until you switch them on in the lists below. After each switch the prices and stock for what you enabled are loaded automatically.</p>
          <p className="muted small">Customers pay your price (HeroSMS dollar price × the dollar rate × your markup, or a rule or price you set in section 4). If no code arrives before the number expires, the customer is refunded automatically.</p>
          <h2>Instant codes (webhook)</h2>
          <p className="muted small">The store already checks HeroSMS every second or two while a customer waits. A webhook makes it even faster: HeroSMS calls the store the moment a code arrives. In your HeroSMS account, look for “webhook” or “callback URL” in the API settings and paste the address below. Deploy the <b>hero-webhook</b> function with “Verify JWT” turned off first.</p>
          <div className="row wrap"><button className="btn sm ghost" onClick={showHook}>Show my webhook address</button>
            {hook?.kind === 'good' && <button className="btn sm gold" onClick={() => void navigator.clipboard?.writeText(hook.text)}>Copy</button>}</div>
          {hook && (hook.kind === 'good' ? <div className="keybox"><span className="mono" style={{ wordBreak: 'break-all' }}>{hook.text}</span></div> : <div className={`notice ${hook.kind} small`}>{hook.text}</div>)}
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

      <AdminNumberPrices />
    </>
  );
}
