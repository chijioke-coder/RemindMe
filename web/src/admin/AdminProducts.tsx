import { useEffect, useState } from 'react';
import { callApi, supabase } from '../lib/supabase';
import { naira } from '../lib/format';

// what a customer would pay: a fixed price, or cost plus markup rounded up to the next ₦10
const calcPrice = (costKobo: number, markup: string | number, override: string | number, defaultMarkup: number) => {
  if (override !== '' && override != null) return Math.round(Number(override) * 100);
  const m = markup === '' || markup == null ? defaultMarkup : Number(markup);
  return Math.ceil((costKobo * (1 + m / 100)) / 1000) * 1000;
};

const EMPTY_OWN = {
  name: '', category_id: '', delivery_type: 'stock', price_naira: '', cost_naira: '',
  description: '', badge: '', input_label: '', delivery_note: '',
};

export default function AdminProducts() {
  const [products, setProducts] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [defaultMarkup, setDefaultMarkup] = useState(20);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [show, setShow] = useState<'all' | 'active' | 'hidden'>('all');
  const [edit, setEdit] = useState<any | null>(null);
  const [own, setOwn] = useState<any | null>(null);
  const [stockFor, setStockFor] = useState<any | null>(null);
  const [stockText, setStockText] = useState('');
  const [bulkCat, setBulkCat] = useState('');
  const [bulkPct, setBulkPct] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    const [p, c, s] = await Promise.all([
      supabase.from('products').select('*').order('id', { ascending: false }),
      supabase.from('categories').select('*').order('sort_order'),
      supabase.from('app_settings').select('default_markup_percent').eq('id', 1).single(),
    ]);
    setProducts(p.data ?? []);
    setCats(c.data ?? []);
    if (s.data) setDefaultMarkup(Number(s.data.default_markup_percent));
  }
  useEffect(() => { void load(); }, []);

  async function sync() {
    setSyncing(true); setMsg(null);
    const r = await callApi<any>('sync_products');
    setSyncing(false);
    if (r.ok) setMsg({ kind: 'good', text: `Synced ${r.products} products. ${r.added} new (hidden until you switch them on), ${r.missing} no longer at the supplier.` });
    else setMsg({ kind: 'bad', text: r.detail || 'Sync failed.' });
    await load();
  }

  async function toggle(p: any) {
    await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id);
    await load();
  }

  async function applyBulk() {
    const pct = Number(bulkPct);
    if (!bulkCat || bulkPct === '' || !Number.isFinite(pct) || pct < 0) return setMsg({ kind: 'bad', text: 'Pick a category and enter a markup percentage.' });
    const { data, error } = await supabase.from('products').update({ markup_percent: pct })
      .eq('category_id', Number(bulkCat)).eq('source', 'supplier').is('price_override_kobo', null).select('id');
    if (error) return setMsg({ kind: 'bad', text: error.message });
    setMsg({ kind: 'good', text: `Markup set to ${pct}% on ${data?.length ?? 0} products. Products with a fixed price were left alone.` });
    setBulkPct('');
    await load();
  }

  function openEdit(p: any) {
    setEdit({
      ...p,
      display_name: p.display_name ?? '',
      markup_percent: p.markup_percent ?? '',
      override_naira: p.price_override_kobo != null ? p.price_override_kobo / 100 : '',
      cost_naira: p.upstream_price_kobo / 100,
      badge: p.badge ?? '', description: p.description ?? '', category_id: p.category_id ?? '',
      input_label: p.input_label ?? '', delivery_note: p.delivery_note ?? '',
    });
  }

  async function save() {
    const e = edit;
    const override = e.override_naira === '' ? null : Math.round(Number(e.override_naira) * 100);
    if (e.source === 'own' && (override === null || override <= 0)) return setMsg({ kind: 'bad', text: 'Set a price for your own product.' });
    setBusy(true);
    const { error } = await supabase.from('products').update({
      display_name: e.display_name || null,
      category_id: e.category_id ? Number(e.category_id) : null,
      markup_percent: e.markup_percent === '' ? null : Number(e.markup_percent),
      price_override_kobo: override,
      badge: e.badge || null,
      description: e.description || null,
      input_label: e.input_label || null,
      delivery_note: e.delivery_note || null,
      sort_order: Number(e.sort_order) || 0,
      ...(e.source === 'own' ? { upstream_price_kobo: Math.round(Number(e.cost_naira || 0) * 100) } : {}),
    }).eq('id', e.id);
    setBusy(false);
    if (error) return setMsg({ kind: 'bad', text: error.message });
    setEdit(null);
    setMsg({ kind: 'good', text: 'Product saved.' });
    await load();
  }

  async function createOwn() {
    const o = own;
    const price = Math.round(Number(o.price_naira) * 100);
    if (!o.name.trim()) return setMsg({ kind: 'bad', text: 'Give the product a name.' });
    if (!(price > 0)) return setMsg({ kind: 'bad', text: 'Enter the price customers will pay.' });
    setBusy(true);
    const { error } = await supabase.from('products').insert({
      source: 'own',
      delivery_type: o.delivery_type,
      track_stock: o.delivery_type === 'stock',
      upstream_product_id: null,
      upstream_name: o.name.trim(),
      category_id: o.category_id ? Number(o.category_id) : null,
      price_override_kobo: price,
      upstream_price_kobo: Math.round(Number(o.cost_naira || 0) * 100),
      description: o.description || null,
      badge: o.badge || null,
      input_label: o.input_label || null,
      delivery_note: o.delivery_note || null,
      is_active: true,
      stock: 0,
    });
    setBusy(false);
    if (error) return setMsg({ kind: 'bad', text: error.message });
    setOwn(null);
    setMsg({
      kind: 'good',
      text: o.delivery_type === 'stock'
        ? 'Product created. Tap "Add stock" on it to upload the items you are selling.'
        : 'Service created and live on the store. Paid orders will appear for you to deliver.',
    });
    await load();
  }

  async function addStock() {
    setBusy(true);
    const r = await callApi<any>('add_stock', { product_id: stockFor.id, items: stockText.split('\n') });
    setBusy(false);
    if (!r.ok) return setMsg({ kind: 'bad', text: r.detail || 'Could not add stock.' });
    setMsg({ kind: 'good', text: `Added ${r.added} items. ${r.stock} now available.` });
    setStockText('');
    setStockFor(null);
    await load();
  }

  async function clearStock() {
    if (!confirm(`Remove all unsold items from "${stockFor.display_name || stockFor.upstream_name}"?`)) return;
    setBusy(true);
    const r = await callApi<any>('clear_stock', { product_id: stockFor.id });
    setBusy(false);
    if (!r.ok) return setMsg({ kind: 'bad', text: r.detail || 'Could not clear stock.' });
    setMsg({ kind: 'good', text: 'Unsold stock removed.' });
    setStockFor(null);
    await load();
  }

  async function remove(p: any) {
    if (!confirm(`Delete "${p.display_name || p.upstream_name}" from your store? Products with past orders cannot be deleted; hide them instead.`)) return;
    const { error } = await supabase.from('products').delete().eq('id', p.id);
    if (error) setMsg({ kind: 'warn', text: 'This product has past orders, so it was kept. Use the switch to hide it instead.' });
    await load();
  }

  const shown = products.filter((p) =>
    (!cat || String(p.category_id) === cat) &&
    (show === 'all' || (show === 'active') === p.is_active) &&
    (!q || (p.display_name || p.upstream_name).toLowerCase().includes(q.toLowerCase())));

  const kindLabel = (p: any) => (p.source !== 'own' ? 'Supplier' : p.delivery_type === 'stock' ? 'Own · instant stock' : 'Own · you deliver');

  return (
    <>
      <div className="row between wrap">
        <h1 style={{ fontSize: '1.8rem' }}>Products</h1>
        <div className="row wrap">
          <button className="btn gold" onClick={() => setOwn({ ...EMPTY_OWN })}>Add my own product</button>
          <button className="btn" disabled={syncing} onClick={sync}>{syncing ? 'Syncing…' : 'Sync from supplier'}</button>
        </div>
      </div>
      {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}

      <div className="panel stack">
        <h3>Set markup for a whole category</h3>
        <div className="row wrap">
          <select className="in grow" value={bulkCat} onChange={(e) => setBulkCat(e.target.value)}>
            <option value="">Choose category</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="in" style={{ width: 110 }} inputMode="decimal" placeholder="% markup" value={bulkPct} onChange={(e) => setBulkPct(e.target.value)} />
          <button className="btn" onClick={applyBulk}>Apply</button>
        </div>
        <p className="muted small">Supplier products only. Anything with a fixed price keeps it. You can still change any single product with Edit.</p>
      </div>

      <div className="grid2">
        <input className="in" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="row">
          <select className="in" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All categories</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="in" value={show} onChange={(e) => setShow(e.target.value as any)}>
            <option value="all">All</option><option value="active">On sale</option><option value="hidden">Hidden</option>
          </select>
        </div>
      </div>

      <div className="panel flat list">
        {shown.map((p) => (
          <div key={p.id} className="stack-s">
            <div className="row between">
              <div className="grow">
                <b>{p.display_name || p.upstream_name}</b>
                <div className="muted small">
                  {cats.find((c) => c.id === p.category_id)?.name ?? 'No category'} · {kindLabel(p)}{p.upstream_missing && ' · gone from supplier'}
                </div>
              </div>
              <button className={`toggle ${p.is_active ? 'on' : ''}`} aria-label="Toggle on sale" onClick={() => toggle(p)} />
            </div>
            <div className="row wrap between small">
              <span className="muted">Cost {naira(p.upstream_price_kobo)}</span>
              <span><b>Price {naira(p.sell_price_kobo)}</b> <span className="muted">({p.price_override_kobo != null ? 'fixed' : `+${p.markup_percent ?? defaultMarkup}%`})</span></span>
              <span className="muted">{p.track_stock ? `Stock ${p.stock}` : 'No stock limit'}</span>
            </div>
            <div className="row wrap">
              <button className="btn sm ghost" onClick={() => openEdit(p)}>Edit</button>
              {p.delivery_type === 'stock' && <button className="btn sm gold" onClick={() => { setStockFor(p); setStockText(''); }}>Add stock</button>}
              <button className="btn sm ghost" onClick={() => remove(p)}>Delete</button>
            </div>
          </div>
        ))}
        {shown.length === 0 && <div className="empty">No products. Tap “Sync from supplier” or “Add my own product”.</div>}
      </div>

      {edit && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && setEdit(null)}>
          <div className="sheet stack">
            <h2>Edit product</h2>
            <p className="muted small">
              {edit.source === 'own' ? 'Your own product' : `Supplier name: ${edit.upstream_name}`} · cost {naira(Math.round(Number(edit.cost_naira || 0) * 100))}
            </p>
            <label className="f"><span>Name shown to customers</span><input className="in" value={edit.display_name} placeholder={edit.upstream_name} onChange={(e) => setEdit({ ...edit, display_name: e.target.value })} /></label>
            <label className="f"><span>Category</span>
              <select className="in" value={edit.category_id} onChange={(e) => setEdit({ ...edit, category_id: e.target.value })}>
                <option value="">None</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            {edit.source === 'own' ? (
              <div className="grid2">
                <label className="f"><span>Price customers pay (₦)</span><input className="in" inputMode="decimal" value={edit.override_naira} onChange={(e) => setEdit({ ...edit, override_naira: e.target.value })} /></label>
                <label className="f"><span>Your cost per item (₦, optional)</span><input className="in" inputMode="decimal" value={edit.cost_naira} onChange={(e) => setEdit({ ...edit, cost_naira: e.target.value })} /></label>
              </div>
            ) : (
              <div className="grid2">
                <label className="f"><span>Markup % (blank = default {defaultMarkup}%)</span><input className="in" inputMode="decimal" value={edit.markup_percent} onChange={(e) => setEdit({ ...edit, markup_percent: e.target.value })} /></label>
                <label className="f"><span>Fixed price ₦ (blank = use markup)</span><input className="in" inputMode="decimal" value={edit.override_naira} onChange={(e) => setEdit({ ...edit, override_naira: e.target.value })} /></label>
              </div>
            )}
            {(() => {
              const cost = Math.round(Number(edit.cost_naira || 0) * 100);
              const price = calcPrice(cost, edit.markup_percent, edit.override_naira, defaultMarkup);
              return <div className="notice good">Customers will pay <b>{naira(price)}</b>. Profit per item: <b>{naira(price - cost)}</b>.</div>;
            })()}
            <div className="grid2">
              <label className="f"><span>Badge (e.g. Hot)</span><input className="in" value={edit.badge} onChange={(e) => setEdit({ ...edit, badge: e.target.value })} /></label>
              <label className="f"><span>Sort order</span><input className="in" inputMode="numeric" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: e.target.value })} /></label>
            </div>
            <label className="f"><span>Description</span><textarea className="in" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></label>
            {edit.source === 'own' && (
              <>
                <label className="f"><span>Ask the customer for (optional, e.g. “Your TikTok username”)</span><input className="in" value={edit.input_label} onChange={(e) => setEdit({ ...edit, input_label: e.target.value })} /></label>
                <label className="f"><span>Delivery message (optional, e.g. “Delivered within 1 hour”)</span><input className="in" value={edit.delivery_note} onChange={(e) => setEdit({ ...edit, delivery_note: e.target.value })} /></label>
              </>
            )}
            <div className="row"><button className="btn grow" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button><button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div>
          </div>
        </div>
      )}

      {own && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && setOwn(null)}>
          <div className="sheet stack">
            <h2>Add my own product</h2>
            <div className="chips">
              <button className={`chip ${own.delivery_type === 'stock' ? 'on' : ''}`} onClick={() => setOwn({ ...own, delivery_type: 'stock' })}>Instant stock</button>
              <button className={`chip ${own.delivery_type === 'manual' ? 'on' : ''}`} onClick={() => setOwn({ ...own, delivery_type: 'manual' })}>I deliver by hand</button>
            </div>
            <p className="muted small">
              {own.delivery_type === 'stock'
                ? 'You upload the items (accounts, logins, codes). Each purchase is delivered to the customer instantly, one item per quantity.'
                : 'For services such as followers or custom work. The customer pays, you get the order in your dashboard, then you type what to deliver.'}
            </p>
            <label className="f"><span>Product name</span><input className="in" value={own.name} onChange={(e) => setOwn({ ...own, name: e.target.value })} /></label>
            <label className="f"><span>Category</span>
              <select className="in" value={own.category_id} onChange={(e) => setOwn({ ...own, category_id: e.target.value })}>
                <option value="">None</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            <div className="grid2">
              <label className="f"><span>Price customers pay (₦)</span><input className="in" inputMode="decimal" value={own.price_naira} onChange={(e) => setOwn({ ...own, price_naira: e.target.value })} /></label>
              <label className="f"><span>Your cost per item (₦, optional)</span><input className="in" inputMode="decimal" value={own.cost_naira} onChange={(e) => setOwn({ ...own, cost_naira: e.target.value })} /></label>
            </div>
            <label className="f"><span>Description</span><textarea className="in" value={own.description} onChange={(e) => setOwn({ ...own, description: e.target.value })} /></label>
            <label className="f"><span>Ask the customer for (optional, e.g. “Your TikTok username”)</span><input className="in" value={own.input_label} onChange={(e) => setOwn({ ...own, input_label: e.target.value })} /></label>
            <label className="f"><span>Delivery message (optional, e.g. “Delivered within 1 hour”)</span><input className="in" value={own.delivery_note} onChange={(e) => setOwn({ ...own, delivery_note: e.target.value })} /></label>
            <label className="f"><span>Badge (optional)</span><input className="in" value={own.badge} onChange={(e) => setOwn({ ...own, badge: e.target.value })} /></label>
            <div className="row"><button className="btn grow" disabled={busy} onClick={createOwn}>{busy ? 'Saving…' : 'Create product'}</button><button className="btn ghost" onClick={() => setOwn(null)}>Cancel</button></div>
          </div>
        </div>
      )}

      {stockFor && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && setStockFor(null)}>
          <div className="sheet stack">
            <h2>Add stock</h2>
            <p className="muted small">{stockFor.display_name || stockFor.upstream_name} · {stockFor.stock} available now</p>
            <label className="f"><span>One item per line (up to 500 at a time)</span>
              <textarea className="in" style={{ minHeight: 180 }} value={stockText} onChange={(e) => setStockText(e.target.value)} placeholder={'email1@example.com | password1\nemail2@example.com | password2'} />
            </label>
            <p className="muted small">{stockText.split('\n').filter((l) => l.trim()).length} items ready to add. Items are encrypted and only shown to the customer who buys them.</p>
            <div className="row">
              <button className="btn grow" disabled={busy || !stockText.trim()} onClick={addStock}>{busy ? 'Adding…' : 'Add to stock'}</button>
              <button className="btn ghost" onClick={() => setStockFor(null)}>Cancel</button>
            </div>
            <button className="btn danger block" disabled={busy} onClick={clearStock}>Remove all unsold items</button>
          </div>
        </div>
      )}
    </>
  );
}
