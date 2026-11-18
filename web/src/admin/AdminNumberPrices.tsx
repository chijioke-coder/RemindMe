import { useCallback, useEffect, useState } from 'react';
import { callApi, supabase } from '../lib/supabase';
import { naira } from '../lib/format';

type Row = {
  country: string; country_name: string; iso: string | null; service: string; service_name: string;
  count: number; rate: number | null; usd_price: number | null; cost_naira: number; price_kobo: number; rule: string; shown: boolean;
};
type Rule = { id: number; kind: string; service: string | null; country: string | null; service_name: string | null; country_name: string | null; min_cost: number | null; max_cost: number | null; markup_percent: number | null };
type Note = { kind: string; text: string } | null;

const RULE_LABEL: Record<string, string> = {
  fixed: 'Your own price', pair: 'Markup for this one', app: 'App markup', country: 'Country markup', band: 'Cost range', default: 'Normal markup',
};
const PAGE = 50;

export default function AdminNumberPrices() {
  const [sq, setSq] = useState('');
  const [cq, setCq] = useState('');
  const [onlyOn, setOnlyOn] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  // bulk
  const [bulkPct, setBulkPct] = useState('');
  const [bulkMin, setBulkMin] = useState('');
  const [bulkMax, setBulkMax] = useState('');
  // rules
  const [rules, setRules] = useState<Rule[]>([]);
  const [pairs, setPairs] = useState(0);
  const [apps, setApps] = useState<{ slug: string; name: string }[]>([]);
  const [ctys, setCtys] = useState<{ slug: string; name: string }[]>([]);
  const [rk, setRk] = useState<'app' | 'country' | 'band'>('app');
  const [rTarget, setRTarget] = useState('');
  const [rPct, setRPct] = useState('');
  const [rMin, setRMin] = useState('');
  const [rMax, setRMax] = useState('');

  const load = useCallback(async (offset: number, replace: boolean) => {
    setLoading(true);
    const r = await callApi<{ rows: Row[]; total: number }>('price_offers', { service: sq.trim(), country: cq.trim(), only_on: onlyOn, limit: PAGE, offset });
    setLoading(false);
    if (!r.ok) { setNote({ kind: 'bad', text: r.detail || 'Could not load the prices.' }); return; }
    setRows((cur) => (replace ? r.rows : [...cur, ...r.rows]));
    setTotal(r.total);
  }, [sq, cq, onlyOn]);

  const loadRules = useCallback(async () => {
    const r = await callApi<{ rules: Rule[]; pairs: number }>('price_rules_list');
    if (r.ok) { setRules(r.rules); setPairs(r.pairs); }
  }, []);

  useEffect(() => { const t = setTimeout(() => void load(0, true), 300); return () => clearTimeout(t); }, [load]);
  useEffect(() => {
    void loadRules();
    supabase.from('sms_services').select('slug,name').eq('is_active', true).order('name').limit(500).then(({ data }) => setApps(data ?? []));
    supabase.from('sms_countries').select('slug,name').eq('is_active', true).order('name').limit(500).then(({ data }) => setCtys(data ?? []));
  }, [loadRules]);

  const key = (r: Row) => `${r.country}|${r.service}`;

  async function savePrice(r: Row, value: string | null) {
    const v = value === null ? null : value.trim();
    const num = v === null || v === '' ? null : Number(v);
    if (num !== null && !(num > 0)) { setNote({ kind: 'bad', text: 'Enter a price in naira, for example 1500.' }); return; }
    if (num !== null && Math.round(num * 100) === r.price_kobo && r.rule === 'fixed') return;
    const res = await callApi('price_rule_set', { kind: 'pair', service: r.service, country: r.country, fixed_naira: num, markup_percent: null });
    setDraft((d) => { const n = { ...d }; delete n[key(r)]; return n; });
    if (!res.ok) { setNote({ kind: 'bad', text: res.detail || 'Could not save.' }); return; }
    setNote({ kind: 'good', text: num === null ? 'Back to the normal price.' : 'Price saved. It stays even when HeroSMS changes its price.' });
    void load(0, true); void loadRules();
  }

  async function bulk(clear: boolean) {
    const min = bulkMin.trim() === '' ? null : Number(bulkMin);
    const max = bulkMax.trim() === '' ? null : Number(bulkMax);
    if (!sq.trim() && !cq.trim() && min === null && max === null) { setNote({ kind: 'bad', text: 'Search for an app or a country first (or fill the cost range), so you know what you are changing.' }); return; }
    if (!clear && !(bulkPct.trim() !== '' && Number.isFinite(Number(bulkPct)))) { setNote({ kind: 'bad', text: 'Enter the markup percent.' }); return; }
    if (!window.confirm(clear ? `Remove your markups from everything matching this search (${total} listed)?` : `Apply a ${bulkPct}% markup to everything matching this search (${total} listed)?`)) return;
    const res = await callApi<{ changed: number }>('price_bulk', { service: sq.trim(), country: cq.trim(), markup_percent: clear ? null : Number(bulkPct), min_cost: min, max_cost: max });
    if (!res.ok) { setNote({ kind: 'bad', text: res.detail || 'Could not apply.' }); return; }
    setNote({ kind: 'good', text: `Done. ${res.changed} prices ${clear ? 'cleared' : 'updated'}.` });
    void load(0, true); void loadRules();
  }

  async function addRule() {
    const body: Record<string, unknown> = { kind: rk, markup_percent: rPct };
    if (rk === 'app') body.service = rTarget;
    if (rk === 'country') body.country = rTarget;
    if (rk === 'band') { body.min_cost = rMin; body.max_cost = rMax; }
    if (rk !== 'band' && !rTarget) { setNote({ kind: 'bad', text: rk === 'app' ? 'Choose an app.' : 'Choose a country.' }); return; }
    if (rPct.trim() === '') { setNote({ kind: 'bad', text: 'Enter the markup percent.' }); return; }
    const res = await callApi('price_rule_set', body);
    if (!res.ok) { setNote({ kind: 'bad', text: res.detail || 'Could not save the rule.' }); return; }
    setRPct(''); setRMin(''); setRMax('');
    setNote({ kind: 'good', text: 'Rule saved. Prices are updated.' });
    void load(0, true); void loadRules();
  }

  async function removeRule(x: Rule) {
    const res = await callApi('price_rule_set', { kind: x.kind, service: x.service, country: x.country, min_cost: x.min_cost, max_cost: x.max_cost, markup_percent: null });
    if (!res.ok) { setNote({ kind: 'bad', text: res.detail || 'Could not remove it.' }); return; }
    void load(0, true); void loadRules();
  }

  const ruleText = (x: Rule) => x.kind === 'app' ? `App: ${x.service_name ?? x.service}`
    : x.kind === 'country' ? `Country: ${x.country_name ?? x.country}`
    : `Cost ₦${Number(x.min_cost).toLocaleString()} to ₦${Number(x.max_cost).toLocaleString()}`;

  return (
    <>
      <h2 style={{ fontSize: '1.3rem' }}>4. Prices (search, change, bulk)</h2>
      {note && <div className={`notice ${note.kind}`}>{note.text}</div>}

      <div className="cols">
        <div className="panel stack">
          <h2>Price rules</h2>
          <p className="muted small">The store uses the <b>first</b> rule that fits, in this order: your own price for one number → markup for one number → app → country → cost range → normal markup. After that it makes sure you earn at least your minimum profit, and rounds up to the next ₦10.</p>
          <div className="list" style={{ border: '1px solid var(--line)', borderRadius: 12 }}>
            {rules.map((x) => (
              <div key={x.id} className="row between">
                <span>{ruleText(x)} <b>+{x.markup_percent}%</b></span>
                <button className="btn sm ghost" onClick={() => removeRule(x)}>Remove</button>
              </div>
            ))}
            {rules.length === 0 && <div className="empty">No rules yet. Everything uses your normal markup.</div>}
          </div>
          {pairs > 0 && <p className="muted small">{pairs} individual prices or markups are set in the table below.</p>}
          <div className="grid2">
            <label className="f"><span>Rule for</span>
              <select className="in" value={rk} onChange={(e) => { setRk(e.target.value as 'app' | 'country' | 'band'); setRTarget(''); }}>
                <option value="app">One app (all countries)</option>
                <option value="country">One country (all apps)</option>
                <option value="band">A cost range</option>
              </select></label>
            {rk !== 'band' ? (
              <label className="f"><span>{rk === 'app' ? 'App' : 'Country'}</span>
                <select className="in" value={rTarget} onChange={(e) => setRTarget(e.target.value)}>
                  <option value="">Choose…</option>
                  {(rk === 'app' ? apps : ctys).map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
                </select></label>
            ) : (
              <div className="grid2">
                <label className="f"><span>Cost from (₦)</span><input className="in" inputMode="decimal" value={rMin} onChange={(e) => setRMin(e.target.value)} placeholder="0" /></label>
                <label className="f"><span>Up to (₦)</span><input className="in" inputMode="decimal" value={rMax} onChange={(e) => setRMax(e.target.value)} placeholder="500" /></label>
              </div>
            )}
          </div>
          <div className="row wrap">
            <label className="f" style={{ flex: 1, minWidth: 140 }}><span>Markup %</span><input className="in" inputMode="decimal" value={rPct} onChange={(e) => setRPct(e.target.value)} placeholder="e.g. 80" /></label>
            <button className="btn" onClick={addRule}>Save rule</button>
          </div>
          <p className="muted small">Example: cost range ₦0 to ₦500 at +150% for cheap numbers, and ₦500 to ₦5,000 at +60% for dearer ones. Only apps and countries you switched on are listed here.</p>
        </div>

        <div className="panel stack">
          <h2>Change many at once</h2>
          <p className="muted small">Search below (for example the app <b>whatsapp</b>, or the country <b>nigeria</b>), then apply one markup to everything that matches. Add a cost range to narrow it further.</p>
          <div className="grid2">
            <label className="f"><span>Markup %</span><input className="in" inputMode="decimal" value={bulkPct} onChange={(e) => setBulkPct(e.target.value)} placeholder="e.g. 70" /></label>
            <div className="grid2">
              <label className="f"><span>Cost from (₦)</span><input className="in" inputMode="decimal" value={bulkMin} onChange={(e) => setBulkMin(e.target.value)} placeholder="any" /></label>
              <label className="f"><span>Up to (₦)</span><input className="in" inputMode="decimal" value={bulkMax} onChange={(e) => setBulkMax(e.target.value)} placeholder="any" /></label>
            </div>
          </div>
          <div className="row wrap">
            <button className="btn" onClick={() => bulk(false)}>Apply to all {total.toLocaleString()} listed</button>
            <button className="btn ghost" onClick={() => bulk(true)}>Clear my markups on these</button>
          </div>
          <p className="muted small">This only changes the markup. A price you typed yourself for one number is kept.</p>
        </div>
      </div>

      <div className="panel stack">
        <h2>All numbers and their prices</h2>
        <div className="grid2">
          <input className="in" placeholder="Search app, e.g. whatsapp" value={sq} onChange={(e) => setSq(e.target.value)} />
          <input className="in" placeholder="Search country, e.g. nigeria or us" value={cq} onChange={(e) => setCq(e.target.value)} />
        </div>
        <label className="check"><input type="checkbox" checked={onlyOn} onChange={(e) => setOnlyOn(e.target.checked)} /> Only numbers that are on sale now (switched on and in stock)</label>
        <p className="muted small">{loading ? 'Loading…' : `${total.toLocaleString()} found`}. Type a new price in the box to set your own price for that number.</p>

        <div style={{ overflowX: 'auto' }}>
          <table className="tbl" style={{ width: '100%', minWidth: 760 }}>
            <thead>
              <tr><th align="left">App</th><th align="left">Country</th><th align="right">Stock</th><th align="right">Costs you</th><th align="right">Profit</th><th align="left">How priced</th><th align="right">Customer pays (₦)</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const k = key(r);
                const price = r.price_kobo / 100;
                const profit = price - Number(r.cost_naira);
                return (
                  <tr key={k} style={r.shown ? undefined : { opacity: 0.55 }}>
                    <td>{r.service_name}</td>
                    <td>{r.country_name}{r.iso ? ` (${r.iso.toUpperCase()})` : ''}</td>
                    <td align="right">{r.count}</td>
                    <td align="right">{naira(Math.round(Number(r.cost_naira) * 100))}</td>
                    <td align="right" className={profit < 0 ? 'amt-minus' : ''}>{naira(Math.round(profit * 100))}</td>
                    <td>{RULE_LABEL[r.rule] ?? r.rule}{r.rule === 'fixed' && <button className="btn sm ghost" style={{ marginLeft: 6 }} onClick={() => savePrice(r, null)}>Reset</button>}</td>
                    <td align="right">
                      <input
                        className="in" inputMode="decimal" style={{ width: 110, minHeight: 36, padding: '6px 8px', textAlign: 'right' }}
                        value={draft[k] ?? String(price)}
                        onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                        onBlur={() => { if (draft[k] !== undefined && draft[k] !== String(price)) void savePrice(r, draft[k]); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && !loading && <tr><td colSpan={7} className="muted" style={{ padding: 16 }}>Nothing matches. Refresh the prices first, switch on some apps and countries, or change your search.</td></tr>}
            </tbody>
          </table>
        </div>
        {rows.length < total && !loading && <button className="btn ghost block" onClick={() => void load(rows.length, false)}>Show more</button>}
      </div>
    </>
  );
}
