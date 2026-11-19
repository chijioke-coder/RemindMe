import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { callApi } from '../lib/supabase';
import { naira } from '../lib/format';

type Preset = 'today' | '7d' | '30d' | 'month' | 'lastmonth' | 'year' | 'all' | 'custom';
const PRESETS: [Preset, string][] = [
  ['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month'],
  ['lastmonth', 'Last month'], ['year', 'This year'], ['all', 'Since the start'], ['custom', 'Pick dates'],
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const inputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function range(p: Preset, from: string, to: string): { from: Date | null; to: Date | null } {
  const t = sod(new Date());
  switch (p) {
    case 'today': return { from: t, to: addDays(t, 1) };
    case '7d': return { from: addDays(t, -6), to: addDays(t, 1) };
    case '30d': return { from: addDays(t, -29), to: addDays(t, 1) };
    case 'month': return { from: new Date(t.getFullYear(), t.getMonth(), 1), to: new Date(t.getFullYear(), t.getMonth() + 1, 1) };
    case 'lastmonth': return { from: new Date(t.getFullYear(), t.getMonth() - 1, 1), to: new Date(t.getFullYear(), t.getMonth(), 1) };
    case 'year': return { from: new Date(t.getFullYear(), 0, 1), to: new Date(t.getFullYear() + 1, 0, 1) };
    case 'all': return { from: null, to: null };
    default: {
      const f = from ? sod(new Date(`${from}T00:00:00`)) : null;
      const e = to ? addDays(sod(new Date(`${to}T00:00:00`)), 1) : null;
      return { from: f, to: e };
    }
  }
}

const compact = (kobo: number) => {
  const n = kobo / 100, a = Math.abs(n);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k` : String(Math.round(a));
  return `${n < 0 ? '-' : ''}₦${s}`;
};
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

function labelFor(d: string, bucket: string) {
  const dt = new Date(`${d}T00:00:00`);
  if (bucket === 'month') return dt.toLocaleDateString('en-NG', { month: 'short', year: '2-digit' });
  return dt.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

function downloadCsv(name: string, rows: (string | number)[][]) {
  const text = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** simple bar chart in SVG. Each point has one or two values; negative values go below the line. */
function Bars({ points, bucket, two }: { points: { d: string; a: number; b?: number }[]; bucket: string; two?: boolean }) {
  const W = 640, H = 210, L = 46, B = 24, T = 10;
  const vals = points.flatMap((p) => [p.a, p.b ?? 0, 0]);
  const max = Math.max(1, ...vals), min = Math.min(0, ...vals);
  const y = (v: number) => T + ((max - v) / (max - min || 1)) * (H - T - B);
  const slot = (W - L - 6) / Math.max(points.length, 1);
  const bw = Math.max(1.5, Math.min(28, slot * (two ? 0.4 : 0.7)));
  const step = Math.max(1, Math.ceil(points.length / 8));
  const ticks = [max, max / 2, 0, ...(min < 0 ? [min] : [])];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: 'block' }}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={L} x2={W - 4} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--mute)">{compact(t)}</text>
        </g>
      ))}
      {points.map((p, i) => {
        const cx = L + slot * i + slot / 2;
        const bar = (v: number, x: number, fill: string, key: string) => (
          <rect key={key} x={x} y={Math.min(y(v), y(0))} width={bw} height={Math.max(1, Math.abs(y(v) - y(0)))} rx="1.5" fill={fill} />
        );
        return (
          <g key={p.d}>
            <title>{`${labelFor(p.d, bucket)}: ${naira(p.a)}${two ? ` sales, ${naira(p.b ?? 0)} cost` : ''}`}</title>
            {two ? <>{bar(p.a, cx - bw - 0.5, 'var(--teal)', 'a')}{bar(p.b ?? 0, cx + 0.5, 'var(--gold)', 'b')}</>
              : bar(p.a, cx - bw / 2, p.a >= 0 ? 'var(--teal)' : 'var(--brick)', 'a')}
            {i % step === 0 && <text x={cx} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--mute)">{labelFor(p.d, bucket)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function Delta({ now, before, goodWhenUp = true }: { now: number; before: number | null; goodWhenUp?: boolean }) {
  if (before === null || before === undefined) return null;
  if (before === 0 && now === 0) return null;
  const up = now >= before;
  const good = up === goodWhenUp;
  const text = before === 0 ? 'new' : `${up ? '+' : ''}${Math.round(((now - before) / Math.abs(before)) * 100)}%`;
  return <span className="small" style={{ color: good ? 'var(--teal-d)' : 'var(--brick)', fontWeight: 700 }}>{up ? '▲' : '▼'} {text} <span className="muted" style={{ fontWeight: 400 }}>vs before</span></span>;
}


type SortKey = 'orders' | 'sales' | 'profit';
const SORTS: [SortKey, string][] = [['orders', 'Most bought'], ['sales', 'Most sales ₦'], ['profit', 'Most profit']];

/** a ranked list the owner can re-sort: most bought, most sales or most profit */
function Ranking({ title, rows, nameKey, salesKey, totalSales, showUnits }: {
  title: string; rows: any[]; nameKey: string; salesKey: string; totalSales: number; showUnits?: boolean;
}) {
  const [by, setBy] = useState<SortKey>('orders');
  const [all, setAll] = useState(false);
  const val = (r: any) => (by === 'orders' ? Number(r.orders) * 1e9 + Number(r[salesKey]) / 100 : by === 'sales' ? Number(r[salesKey]) : Number(r.profit));
  const sorted = [...rows].sort((a, b) => val(b) - val(a));
  const shown = all ? sorted : sorted.slice(0, 10);
  const maxSales = Math.max(1, ...rows.map((r) => Number(r[salesKey])));
  return (
    <div className="panel stack-s">
      <h2>{title}</h2>
      <div className="chips">{SORTS.map(([v, l]) => <button key={v} className={`chip ${by === v ? 'on' : ''}`} onClick={() => setBy(v)}>{l}</button>)}</div>
      {shown.length === 0 && <p className="muted small">No sales in this period.</p>}
      {shown.map((r, i) => (
        <div key={r[nameKey]} className="stack-s" style={{ gap: 4 }}>
          <div className="row between" style={{ gap: 8 }}>
            <span style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{i + 1}. {r[nameKey]}</span>
            <span className="small" style={{ whiteSpace: 'nowrap' }}><b>{r.orders}</b> {Number(r.orders) === 1 ? 'purchase' : 'purchases'}{showUnits && Number(r.units) !== Number(r.orders) ? ` · ${r.units} units` : ''}</span>
          </div>
          <div style={{ background: 'var(--mist)', borderRadius: 6, height: 8 }}><div style={{ width: `${(Number(r[salesKey]) / maxSales) * 100}%`, height: 8, borderRadius: 6, background: 'var(--teal)' }} /></div>
          <div className="row between small muted">
            <span>{naira(r[salesKey])} ({pct(Number(r[salesKey]), totalSales)}% of sales) · last {r.last_at ? new Date(r.last_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : '-'}</span>
            <span style={{ color: Number(r.profit) < 0 ? 'var(--brick)' : 'var(--teal-d)', fontWeight: 700 }}>profit {naira(r.profit)}</span>
          </div>
        </div>
      ))}
      {rows.length > 10 && <button className="btn sm ghost" onClick={() => setAll(!all)}>{all ? 'Show top 10' : `Show all ${rows.length}`}</button>}
    </div>
  );
}

export default function AdminAnalytics() {
  const [preset, setPreset] = useState<Preset>('30d');
  const [cFrom, setCFrom] = useState(inputDate(addDays(sod(new Date()), -29)));
  const [cTo, setCTo] = useState(inputDate(sod(new Date())));
  const [incAdmin, setIncAdmin] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = range(preset, cFrom, cTo);
    if (preset === 'custom' && (!r.from || !r.to || r.to <= r.from)) { setErr('Pick a start date and a later end date.'); return; }
    setBusy(true); setErr('');
    const res = await callApi<any>('analytics', {
      from: r.from?.toISOString() ?? null, to: r.to?.toISOString() ?? null,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Lagos', include_admin: incAdmin,
    });
    setBusy(false);
    if (res.ok) setData(res); else setErr(res.detail || 'Could not load the numbers.');
  }, [preset, cFrom, cTo, incAdmin]);
  useEffect(() => { void load(); }, [load]);

  const k = data?.kpis, pv = data?.prev;
  const profit = k ? k.revenue - k.cost : 0;
  const pvProfit = pv ? pv.revenue - pv.cost : null;

  const insights = useMemo(() => {
    if (!data || !k) return [] as { kind: string; text: string }[];
    const out: { kind: string; text: string }[] = [];
    const series: any[] = data.series ?? [];
    if (k.orders === 0) return [{ kind: 'warn', text: 'No completed sales in this period.' }];
    out.push({ kind: profit >= 0 ? 'good' : 'bad', text: profit >= 0 ? `You made ${naira(profit)} profit on ${naira(k.revenue)} of sales (${pct(profit, k.revenue)}% margin).` : `You lost ${naira(-profit)} in this period. Costs were higher than sales.` });
    if (k.loss_orders > 0) out.push({ kind: 'bad', text: `${k.loss_orders} sale${k.loss_orders > 1 ? 's were' : ' was'} sold below cost and lost ${naira(k.loss_kobo)}. See "Sales that lost money" below, and raise those prices.` });
    if (k.cost_guessed > 0) out.push({ kind: 'warn', text: `For ${k.cost_guessed} order${k.cost_guessed > 1 ? 's' : ''} the supplier's charge was not recorded, so the cost is estimated from the product's cost price.` });
    if (k.revenue > 0 && pct(profit, k.revenue) < 10 && profit >= 0) out.push({ kind: 'warn', text: 'Your margin is under 10%. A small price rise or a cheaper supplier would help.' });
    if (k.placed > 0 && pct(k.failed, k.placed) >= 15) out.push({ kind: 'warn', text: `${pct(k.failed, k.placed)}% of orders failed and were refunded (${naira(k.refunded)}). Check Admin → Orders for the reasons.` });
    const best = [...series].sort((a, b) => (b.revenue - b.cost) - (a.revenue - a.cost))[0];
    if (best && best.orders > 0) out.push({ kind: 'good', text: `Best ${data.bucket}: ${labelFor(best.d, data.bucket)} with ${naira(best.revenue - best.cost)} profit.` });
    const hours: any[] = data.by_hour ?? [];
    const hot = [...hours].sort((a, b) => b.orders - a.orders)[0];
    if (hot && hot.orders > 0) out.push({ kind: 'info', text: `Busiest time: around ${String(hot.h).padStart(2, '0')}:00 (${hot.orders} orders). Stay online then.` });
    const days: any[] = data.by_weekday ?? [];
    const hotDay = [...days].sort((a, b) => b.revenue - a.revenue)[0];
    if (hotDay && hotDay.revenue > 0) out.push({ kind: 'info', text: `Best day of the week: ${DAYS[hotDay.d]}.` });
    const mp = [...(data.top_products ?? [])].sort((a: any, b: any) => b.orders - a.orders)[0];
    if (mp) out.push({ kind: 'info', text: `Most bought product: ${mp.name} (${mp.orders} purchases, ${naira(mp.profit)} profit).` });
    const mc = [...(data.top_customers ?? [])].sort((a: any, b: any) => b.orders - a.orders)[0];
    if (mc) out.push({ kind: 'info', text: `Customer who bought most often: ${mc.email} (${mc.orders} purchases, ${naira(mc.spent)}).` });
    const top = (data.top_customers ?? [])[0];
    if (top && k.revenue > 0 && pct(top.spent, k.revenue) >= 40 && k.buyers > 1) out.push({ kind: 'warn', text: `One customer (${top.email}) is ${pct(top.spent, k.revenue)}% of your sales. Losing them would hurt.` });
    for (const a of (data.sms_apps ?? []) as any[]) if (a.placed >= 5 && pct(a.done, a.placed) < 60) out.push({ kind: 'warn', text: `${a.name} numbers: only ${pct(a.done, a.placed)}% of ${a.placed} orders got a code. Consider hiding it or lowering the price.` });
    return out;
  }, [data, k, profit]);

  const series: any[] = data?.series ?? [];
  const maxHour = Math.max(1, ...(data?.by_hour ?? []).map((h: any) => h.orders));
  const maxDay = Math.max(1, ...(data?.by_weekday ?? []).map((h: any) => h.orders));

  function exportCsv() {
    if (!data) return;
    downloadCsv('profit-by-period.csv', [
      ['Period', 'Sales (NGN)', 'Cost (NGN)', 'Profit (NGN)', 'Orders'],
      ...series.map((s) => [s.d, s.revenue / 100, s.cost / 100, (s.revenue - s.cost) / 100, s.orders]),
    ]);
    downloadCsv('profit-by-product.csv', [
      ['Product', 'Purchases', 'Units', 'Sales (NGN)', 'Cost (NGN)', 'Profit (NGN)'],
      ...(data.top_products ?? []).map((p: any) => [p.name, p.orders, p.units, p.revenue / 100, p.cost / 100, p.profit / 100]),
    ]);
    downloadCsv('top-customers.csv', [
      ['Customer', 'Purchases', 'Units', 'Spent (NGN)', 'Profit (NGN)', 'Last purchase'],
      ...(data.top_customers ?? []).map((c: any) => [c.email, c.orders, c.units, c.spent / 100, c.profit / 100, c.last_at ?? '']),
    ]);
  }

  const Card = ({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: 'good' | 'bad' }) => (
    <div className="stat" style={tone ? { borderColor: tone === 'good' ? 'var(--teal)' : 'var(--brick)' } : undefined}>
      <div className="muted small">{label}</div>
      <div className="v" style={tone ? { color: tone === 'good' ? 'var(--teal-d)' : 'var(--brick)' } : undefined}>{value}</div>
      {sub}
    </div>
  );

  const Table = ({ head, rows, empty }: { head: string[]; rows: (string | number | JSX.Element)[][]; empty: string }) => (
    <div style={{ overflowX: 'auto' }}>
      <table className="tbl" style={{ width: '100%', minWidth: 420 }}>
        <thead><tr>{head.map((h, i) => <th key={h} align={i === 0 ? 'left' : 'right'}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} align={j === 0 ? 'left' : 'right'}>{c}</td>)}</tr>)}
          {rows.length === 0 && <tr><td colSpan={head.length} className="muted" style={{ padding: 14 }}>{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
  const money = (v: number) => <span style={{ color: v < 0 ? 'var(--brick)' : undefined }}>{naira(v)}</span>;

  return (
    <>
      <h1 style={{ fontSize: '1.8rem' }}>Profit and analytics</h1>

      <div className="panel stack">
        <div className="chips">
          {PRESETS.map(([v, l]) => <button key={v} className={`chip ${preset === v ? 'on' : ''}`} onClick={() => setPreset(v)}>{l}</button>)}
        </div>
        {preset === 'custom' && (
          <div className="grid2">
            <label className="f"><span>From</span><input className="in" type="date" value={cFrom} max={cTo} onChange={(e) => setCFrom(e.target.value)} /></label>
            <label className="f"><span>To (included)</span><input className="in" type="date" value={cTo} min={cFrom} onChange={(e) => setCTo(e.target.value)} /></label>
          </div>
        )}
        <div className="row between wrap">
          <label className="check"><input type="checkbox" checked={incAdmin} onChange={(e) => setIncAdmin(e.target.checked)} /> Include my own test orders</label>
          <div className="row wrap">
            <button className="btn sm ghost" disabled={busy} onClick={() => void load()}>{busy ? 'Loading…' : 'Refresh'}</button>
            <button className="btn sm ghost" disabled={!data} onClick={exportCsv}>Download CSV</button>
          </div>
        </div>
        {data && <p className="muted small">{new Date(data.from).toLocaleDateString('en-NG', { dateStyle: 'medium' })} to {new Date(new Date(data.to).getTime() - 1000).toLocaleDateString('en-NG', { dateStyle: 'medium' })}. Profit = what customers paid minus what the supplier charged you, on completed orders. Refunded orders are not counted as sales.</p>}
      </div>

      {err && <div className="notice bad">{err}</div>}
      {!data && !err && <p className="muted">Loading…</p>}

      {data && k && (
        <>
          <div className="stats">
            <Card label="Profit" value={naira(profit)} tone={profit >= 0 ? 'good' : 'bad'} sub={<Delta now={profit} before={pvProfit} />} />
            <Card label="Sales" value={naira(k.revenue)} sub={<Delta now={k.revenue} before={pv ? pv.revenue : null} />} />
            <Card label="Cost (supplier)" value={naira(k.cost)} sub={<Delta now={k.cost} before={pv ? pv.cost : null} goodWhenUp={false} />} />
            <Card label="Profit margin" value={`${pct(profit, k.revenue)}%`} />
            <Card label="Completed orders" value={k.orders.toLocaleString()} sub={<Delta now={k.orders} before={pv ? pv.orders : null} />} />
            <Card label="Average order" value={naira(k.orders ? Math.round(k.revenue / k.orders) : 0)} />
            <Card label="Refunded orders" value={`${k.failed.toLocaleString()} (${naira(k.refunded)})`} />
            <Card label="Lost on below-cost sales" value={naira(k.loss_kobo)} tone={k.loss_kobo > 0 ? 'bad' : undefined} />
            <Card label="Customers who bought" value={k.buyers.toLocaleString()} />
            <Card label="New sign-ups" value={k.new_customers.toLocaleString()} sub={<Delta now={k.new_customers} before={pv ? pv.new_customers : null} />} />
            <Card label="Money customers added" value={naira(k.funded)} sub={<Delta now={k.funded} before={pv ? pv.funded : null} />} />
            <Card label="Free credit you gave" value={naira(k.free_credit)} />
            <Card label="Held in customer wallets now" value={naira(data.wallets_now)} />
          </div>

          <div className="panel stack-s">
            <h2>What stands out</h2>
            {insights.map((x, i) => <div key={i} className={`notice ${x.kind === 'info' ? '' : x.kind} small`}>{x.text}</div>)}
          </div>

          <div className="panel stack-s">
            <h2>Profit over time</h2>
            <Bars bucket={data.bucket} points={series.map((s) => ({ d: s.d, a: s.revenue - s.cost }))} />
            <p className="muted small">Green is profit, red is a loss. Each bar is one {data.bucket}.</p>
          </div>

          <div className="panel stack-s">
            <h2>Sales and cost</h2>
            <Bars two bucket={data.bucket} points={series.map((s) => ({ d: s.d, a: s.revenue, b: s.cost }))} />
            <p className="muted small"><b style={{ color: 'var(--teal-d)' }}>■</b> Sales &nbsp; <b style={{ color: 'var(--gold)' }}>■</b> Cost</p>
          </div>

          <div className="cols">
            <div className="panel stack-s">
              <h2>By kind of product</h2>
              <Table head={['Kind', 'Orders', 'Sales', 'Profit']} empty="No data."
                rows={(data.by_type ?? []).map((t: any) => [({ supplier: 'Supplier products', stock: 'Your own stock', manual: 'Made to order', sms: 'Virtual numbers' } as Record<string, string>)[t.type] ?? t.type, t.orders, naira(t.revenue), money(t.revenue - t.cost)])} />
            </div>
          </div>

          <div className="cols">
            <Ranking title="Products people buy most" rows={data.top_products ?? []} nameKey="name" salesKey="revenue" totalSales={k.revenue} showUnits />
            <Ranking title="Customers who buy most" rows={data.top_customers ?? []} nameKey="email" salesKey="spent" totalSales={k.revenue} showUnits />
          </div>

          <div className="panel stack-s">
            <h2>Sales that lost money</h2>
            {(data.loss_orders ?? []).length === 0 ? <div className="notice good small">No sale in this period was sold below cost.</div> : (
              <>
                <Table head={['Order', 'Customer paid', 'It cost you', 'Loss']} empty=""
                  rows={(data.loss_orders ?? []).map((o: any) => [`${o.name} · ${new Date(o.ts).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}`, naira(o.revenue), naira(o.cost), money(-o.loss)])} />
                {(data.loss_products ?? []).length > 0 && <p className="muted small">Products losing money overall: {(data.loss_products as any[]).map((p) => `${p.name} (${naira(p.profit)})`).join(', ')}.</p>}
              </>
            )}
          </div>

          <div className="cols">
            <div className="panel stack-s">
              <h2>Busy days</h2>
              {(data.by_weekday ?? []).map((d: any) => (
                <div key={d.d} className="row" style={{ gap: 8 }}>
                  <span className="small" style={{ width: 84 }}>{DAYS[d.d]}</span>
                  <div style={{ flex: 1, background: 'var(--mist)', borderRadius: 6, height: 12 }}><div style={{ width: `${(d.orders / maxDay) * 100}%`, height: 12, borderRadius: 6, background: 'var(--teal)' }} /></div>
                  <span className="small muted" style={{ width: 34, textAlign: 'right' }}>{d.orders}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel stack-s">
            <h2>Busy hours of the day</h2>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90 }}>
              {(data.by_hour ?? []).map((h: any) => (
                <div key={h.h} title={`${String(h.h).padStart(2, '0')}:00 · ${h.orders} orders`} style={{ flex: 1, height: `${Math.max(3, (h.orders / maxHour) * 100)}%`, background: h.orders ? 'var(--teal)' : 'var(--line)', borderRadius: 3 }} />
              ))}
            </div>
            <div className="row between small muted"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>
          </div>

          {((data.sms_apps ?? []).length > 0) && (
            <div className="cols">
              <div className="panel stack-s">
                <h2>Virtual numbers by app</h2>
                <Table head={['App', 'Orders', 'Got a code', 'Profit']} empty=""
                  rows={(data.sms_apps ?? []).map((a: any) => [a.name, a.placed, `${pct(a.done, a.placed)}%`, money(a.revenue - a.cost)])} />
              </div>
              <div className="panel stack-s">
                <h2>Virtual numbers by country</h2>
                <Table head={['Country', 'Orders', 'Got a code', 'Profit']} empty=""
                  rows={(data.sms_countries ?? []).map((a: any) => [a.name, a.placed, `${pct(a.done, a.placed)}%`, money(a.revenue - a.cost)])} />
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
