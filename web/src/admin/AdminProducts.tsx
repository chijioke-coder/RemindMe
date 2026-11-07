import { useEffect, useState } from 'react';
import { callApi, supabase } from '../lib/supabase';
import { naira } from '../lib/format';
import { resizeImage, safeName } from '../lib/images';
import ProductIcon from '../components/ProductIcon';
import Linkify from '../components/Linkify';

// what a customer would pay: a fixed price, or cost plus markup rounded up to the next ₦10
const calcPrice = (costKobo: number, markup: string | number, override: string | number, defaultMarkup: number) => {
  if (override !== '' && override != null) return Math.round(Number(override) * 100);
  const m = markup === '' || markup == null ? defaultMarkup : Number(markup);
  return Math.ceil((costKobo * (1 + m / 100)) / 1000) * 1000;
};

const EMPTY_OWN = {
  name: '', category_id: '', delivery_type: 'stock', price_naira: '', cost_naira: '',
  description: '', badge: '', input_label: '', delivery_note: '', pick_items: false, after_message: '',
  delivery_hours: '24', iconFile: null as File | null,
  show_quantity: true, shared_text: '', sharedFiles: [] as File[],
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
  const [stockTab, setStockTab] = useState<'lines' | 'link' | 'file'>('lines');
  const [sharedFor, setSharedFor] = useState<any | null>(null);
  const [sharedText, setSharedText] = useState('');
  const [sharedFiles, setSharedFiles] = useState<{ id: number; name: string }[]>([]);
  const [sharedNew, setSharedNew] = useState<File[]>([]);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [fLabel, setFLabel] = useState('');
  const [fDetails, setFDetails] = useState('');
  const [fFile, setFFile] = useState<File | null>(null);
  const [lLabel, setLLabel] = useState('');
  const [lUrl, setLUrl] = useState('');
  const [viewStock, setViewStock] = useState<any | null>(null);
  const [stockRows, setStockRows] = useState<any[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
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

  // ---- icons (stored in the public product-icons bucket) ----
  async function uploadIcon(p: any, file: File) {
    const blob = await resizeImage(file);
    const path = `${p.id}/${crypto.randomUUID()}.webp`;
    const { error } = await supabase.storage.from('product-icons').upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000' });
    if (error) throw error;
    const { error: ue } = await supabase.from('products').update({ icon_path: path }).eq('id', p.id);
    if (ue) throw ue;
    if (p.icon_path) await supabase.storage.from('product-icons').remove([p.icon_path]);
    return path;
  }

  async function pickIcon(file: File | undefined) {
    if (!file || !edit) return;
    setBusy(true);
    try {
      const path = await uploadIcon(edit, file);
      setEdit({ ...edit, icon_path: path });
      setMsg({ kind: 'good', text: 'Icon saved.' });
      await load();
    } catch (e: any) {
      setMsg({ kind: 'bad', text: e?.message ?? 'Could not upload the icon.' });
    }
    setBusy(false);
  }

  async function removeIcon() {
    if (!edit?.icon_path) return;
    setBusy(true);
    await supabase.storage.from('product-icons').remove([edit.icon_path]);
    await supabase.from('products').update({ icon_path: null }).eq('id', edit.id);
    setEdit({ ...edit, icon_path: null });
    setBusy(false);
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
      delivery_hours: p.delivery_hours ?? '', after_message: p.after_message ?? '',
    });
  }

  async function save() {
    const e = edit;
    const override = e.override_naira === '' ? null : Math.round(Number(e.override_naira) * 100);
    if (e.source === 'own' && (override === null || override <= 0)) return setMsg({ kind: 'bad', text: 'Set a price for your own product.' });
    if (e.delivery_type === 'manual' && !(Number(e.delivery_hours) >= 1)) return setMsg({ kind: 'bad', text: 'Set how many hours you need to deliver this service.' });
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
      after_message: e.after_message || null,
      delivery_hours: e.delivery_type === 'manual' ? Number(e.delivery_hours) : null,
      sort_order: Number(e.sort_order) || 0,
      pick_items: e.delivery_type === 'stock' ? !!e.pick_items : false,
      ...(e.source === 'own' ? { upstream_price_kobo: Math.round(Number(e.cost_naira || 0) * 100), show_quantity: e.pick_items ? true : e.show_quantity !== false } : {}),
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
    if (o.delivery_type === 'manual' && !(Number(o.delivery_hours) >= 1)) return setMsg({ kind: 'bad', text: 'Say how many hours you need to deliver this service.' });
    if (o.delivery_type === 'unlimited' && !o.shared_text.trim() && o.sharedFiles.length === 0) {
      return setMsg({ kind: 'bad', text: 'Add the link, text or file that every buyer will receive.' });
    }
    setBusy(true);
    const { data, error } = await supabase.from('products').insert({
      source: 'own',
      delivery_type: o.delivery_type,
      track_stock: o.delivery_type === 'stock',
      show_quantity: o.delivery_type === 'stock' && o.pick_items ? true : !!o.show_quantity,
      pick_items: o.delivery_type === 'stock' && !!o.pick_items,
      upstream_product_id: null,
      upstream_name: o.name.trim(),
      category_id: o.category_id ? Number(o.category_id) : null,
      price_override_kobo: price,
      upstream_price_kobo: Math.round(Number(o.cost_naira || 0) * 100),
      description: o.description || null,
      badge: o.badge || null,
      input_label: o.input_label || null,
      delivery_note: o.delivery_note || null,
      after_message: o.after_message || null,
      delivery_hours: o.delivery_type === 'manual' ? Number(o.delivery_hours) : null,
      is_active: true,
      stock: 0,
    }).select('id').single();
    if (error || !data) { setBusy(false); return setMsg({ kind: 'bad', text: error?.message ?? 'Could not create the product.' }); }
    let iconNote = '';
    if (o.iconFile) {
      try { await uploadIcon({ id: data.id, icon_path: null }, o.iconFile); } catch (e: any) { iconNote = ` The icon could not be uploaded (${e?.message ?? 'error'}); add it with Edit.`; }
    }
    if (o.delivery_type === 'unlimited') {
      try {
        const r = await callApi<any>('set_shared_text', { product_id: data.id, text: o.shared_text });
        if (!r.ok) throw new Error(r.detail || 'Could not save the content.');
        await uploadSharedFiles(data.id, o.sharedFiles);
      } catch (e: any) {
        iconNote += ` The content could not be saved (${e?.message ?? 'error'}); open Edit content on the product.`;
      }
    }
    setBusy(false);
    setOwn(null);
    setMsg({
      kind: iconNote ? 'warn' : 'good',
      text: (o.delivery_type === 'stock'
        ? 'Product created. Tap "Add stock" on it to upload the items you are selling.'
        : o.delivery_type === 'unlimited'
        ? 'Product created. Every buyer receives the content you added, and it never runs out.'
        : 'Service created and live on the store. Paid orders will appear for you to deliver.') + iconNote,
    });
    await load();
  }

  // ---- stock ----
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

  async function addStockLink() {
    const url = lUrl.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) return setMsg({ kind: 'bad', text: 'Enter a full link that starts with http:// or https://' });
    setBusy(true);
    const line = lLabel.trim() ? `${lLabel.trim()} ## ${url}` : url;
    const r = await callApi<any>('add_stock', { product_id: stockFor.id, items: [line] });
    setBusy(false);
    if (!r.ok) return setMsg({ kind: 'bad', text: r.detail || 'Could not add the link.' });
    setMsg({ kind: 'good', text: `Link added. ${r.stock} now available.` });
    setLLabel(''); setLUrl('');
    setStockFor(null);
    await load();
  }

  async function addStockFile() {
    if (!fFile) return;
    setBusy(true);
    try {
      const path = `stock/${stockFor.id}/${crypto.randomUUID()}-${safeName(fFile.name)}`;
      const up = await supabase.storage.from('delivery-files').upload(path, fFile, { contentType: fFile.type || undefined });
      if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
      const r = await callApi<any>('add_stock_file', {
        product_id: stockFor.id, label: fLabel, details: fDetails, file_path: path, file_name: fFile.name,
      });
      if (!r.ok) {
        await supabase.storage.from('delivery-files').remove([path]);
        throw new Error(r.detail || 'Could not add the item.');
      }
      setMsg({ kind: 'good', text: `Item with file added. ${r.stock} now available.` });
      setFLabel(''); setFDetails(''); setFFile(null);
      setStockFor(null);
      await load();
    } catch (e: any) {
      setMsg({ kind: 'bad', text: e?.message ?? 'Could not add the item.' });
    }
    setBusy(false);
  }

  // ---- content every buyer of a same-for-everyone product receives ----
  async function uploadSharedFiles(productId: number, files: File[]) {
    for (const f of files) {
      const path = `shared/${productId}/${crypto.randomUUID()}-${safeName(f.name)}`;
      const up = await supabase.storage.from('delivery-files').upload(path, f, { contentType: f.type || undefined });
      if (up.error) throw new Error(`Could not upload ${f.name}: ${up.error.message}`);
      const r = await callApi<any>('add_shared_file', { product_id: productId, file_path: path, file_name: f.name });
      if (!r.ok) {
        await supabase.storage.from('delivery-files').remove([path]);
        throw new Error(r.detail || 'Could not save the file.');
      }
    }
  }

  async function openShared(p: any) {
    setSharedFor(p); setSharedText(''); setSharedFiles([]); setSharedNew([]); setSharedLoading(true);
    const r = await callApi<any>('get_shared', { product_id: p.id });
    setSharedLoading(false);
    if (r.ok) { setSharedText(r.text); setSharedFiles(r.files); } else setMsg({ kind: 'bad', text: r.detail || 'Could not load the content.' });
  }

  async function saveShared() {
    if (!sharedText.trim() && sharedFiles.length === 0 && sharedNew.length === 0) {
      return setMsg({ kind: 'bad', text: 'Add a link, some text or a file for buyers to receive.' });
    }
    setBusy(true);
    try {
      const r = await callApi<any>('set_shared_text', { product_id: sharedFor.id, text: sharedText });
      if (!r.ok) throw new Error(r.detail || 'Could not save the text.');
      await uploadSharedFiles(sharedFor.id, sharedNew);
      setMsg({ kind: 'good', text: 'Content saved. New buyers receive it straight away. People who already bought keep what they received.' });
      setSharedFor(null);
    } catch (e: any) {
      setMsg({ kind: 'bad', text: e?.message ?? 'Could not save.' });
    }
    setBusy(false);
  }

  async function removeSharedFile(id: number) {
    if (!confirm('Remove this file? New buyers will no longer receive it.')) return;
    const r = await callApi<any>('remove_shared_file', { file_id: id });
    if (!r.ok) return setMsg({ kind: 'bad', text: r.detail || 'Could not remove it.' });
    setSharedFiles((fs) => fs.filter((f) => f.id !== id));
  }

  async function openStockView(p: any) {
    setViewStock(p);
    setStockRows([]);
    setStockLoading(true);
    const r = await callApi<any>('list_stock', { product_id: p.id });
    setStockLoading(false);
    if (r.ok) setStockRows(r.items); else setMsg({ kind: 'bad', text: r.detail || 'Could not load stock.' });
  }

  async function removeItem(id: number) {
    if (!confirm('Remove this unsold item?')) return;
    const r = await callApi<any>('remove_stock_item', { item_id: id });
    if (!r.ok) return setMsg({ kind: 'bad', text: r.detail || 'Could not remove it.' });
    setStockRows((rows) => rows.filter((x) => x.id !== id));
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
    else if (p.icon_path) await supabase.storage.from('product-icons').remove([p.icon_path]);
    await load();
  }

  const shown = products.filter((p) =>
    (!cat || String(p.category_id) === cat) &&
    (show === 'all' || (show === 'active') === p.is_active) &&
    (!q || (p.display_name || p.upstream_name).toLowerCase().includes(q.toLowerCase())));

  const kindLabel = (p: any) => (p.source !== 'own' ? 'Supplier' : p.delivery_type === 'stock' ? 'Own · instant stock' : p.delivery_type === 'unlimited' ? 'Own · same for everyone' : 'Own · you deliver');

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

      <div className="pgrid">
        {shown.map((p) => (
          <div key={p.id} className="panel stack-s">
            <div className="row between">
              <ProductIcon path={p.icon_path} label={p.display_name || p.upstream_name} seed={p.category_id ?? p.id} size={42} />
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
              <span className="muted">{p.track_stock ? `Stock ${p.stock}` : p.delivery_hours ? `Delivers in ${p.delivery_hours}h` : 'No stock limit'}</span>
            </div>
            <div className="row wrap">
              <button className="btn sm ghost" onClick={() => openEdit(p)}>Edit</button>
              {p.delivery_type === 'stock' && <button className="btn sm gold" onClick={() => { setStockFor(p); setStockText(''); setStockTab('lines'); }}>Add stock</button>}
              {p.delivery_type === 'stock' && <button className="btn sm ghost" onClick={() => openStockView(p)}>View stock</button>}
              {p.delivery_type === 'unlimited' && <button className="btn sm gold" onClick={() => openShared(p)}>Edit content</button>}
              <button className="btn sm ghost" onClick={() => remove(p)}>Delete</button>
            </div>
          </div>
        ))}
        {shown.length === 0 && <div className="empty">No products. Tap “Sync from supplier” or “Add my own product”.</div>}
      </div>

      {edit && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && setEdit(null)}>
          <div className="sheet stack">
            <h2>Edit product</h2>
            <p className="muted small">
              {edit.source === 'own' ? 'Your own product' : `Supplier name: ${edit.upstream_name}`} · cost {naira(Math.round(Number(edit.cost_naira || 0) * 100))}
            </p>

            <div className="row">
              <ProductIcon path={edit.icon_path} label={edit.display_name || edit.upstream_name} seed={edit.category_id || edit.id} size={64} />
              <div className="grow stack-s">
                <b className="small">Product icon</b>
                <div className="row wrap">
                  <label className="btn sm ghost" style={{ cursor: 'pointer' }}>
                    {edit.icon_path ? 'Replace' : 'Upload'}
                    <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => { void pickIcon(e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                  {edit.icon_path && <button className="btn sm ghost" disabled={busy} onClick={removeIcon}>Remove</button>}
                </div>
              </div>
            </div>

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
            {edit.source === 'own' && edit.delivery_type === 'stock' && (
              <label className="check"><input type="checkbox" checked={!!edit.pick_items} onChange={(e) => setEdit({ ...edit, pick_items: e.target.checked })} /> Let customers choose which item they buy</label>
            )}
            {edit.delivery_type === 'manual' && (
              <label className="f"><span>Promised delivery time (hours)</span><input className="in" inputMode="numeric" value={edit.delivery_hours} onChange={(e) => setEdit({ ...edit, delivery_hours: e.target.value })} /></label>
            )}
            {edit.source === 'own' && !edit.pick_items && (
              <label className="check"><input type="checkbox" checked={edit.show_quantity !== false} onChange={(e) => setEdit({ ...edit, show_quantity: e.target.checked })} /> Show the quantity picker{edit.track_stock ? ' and the "available" count' : ''} to customers</label>
            )}
            <div className="grid2">
              <label className="f"><span>Badge (e.g. Hot)</span><input className="in" value={edit.badge} onChange={(e) => setEdit({ ...edit, badge: e.target.value })} /></label>
              <label className="f"><span>Sort order</span><input className="in" inputMode="numeric" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: e.target.value })} /></label>
            </div>
            <label className="f"><span>Description</span><textarea className="in" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></label>
            <label className="f"><span>Message shown after purchase (optional, e.g. “Thank you! Your order is being prepared.”)</span><textarea className="in" value={edit.after_message} onChange={(e) => setEdit({ ...edit, after_message: e.target.value })} /></label>
            {edit.source === 'own' && (
              <>
                <label className="f"><span>Ask the customer for (optional, e.g. “Your TikTok username”)</span><input className="in" value={edit.input_label} onChange={(e) => setEdit({ ...edit, input_label: e.target.value })} /></label>
                <label className="f"><span>Short note shown before buying (optional)</span><input className="in" value={edit.delivery_note} onChange={(e) => setEdit({ ...edit, delivery_note: e.target.value })} /></label>
              </>
            )}
            <div className="row"><button className="btn grow" disabled={busy} onClick={save}>{busy ? 'Working…' : 'Save changes'}</button><button className="btn ghost" disabled={busy} onClick={() => setEdit(null)}>Close</button></div>
          </div>
        </div>
      )}

      {own && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && setOwn(null)}>
          <div className="sheet stack">
            <h2>Add my own product</h2>
            <div className="chips">
              <button className={`chip ${own.delivery_type === 'stock' ? 'on' : ''}`} onClick={() => setOwn({ ...own, delivery_type: 'stock', show_quantity: true })}>Instant stock</button>
              <button className={`chip ${own.delivery_type === 'unlimited' ? 'on' : ''}`} onClick={() => setOwn({ ...own, delivery_type: 'unlimited', show_quantity: false, pick_items: false })}>Same for everyone</button>
              <button className={`chip ${own.delivery_type === 'manual' ? 'on' : ''}`} onClick={() => setOwn({ ...own, delivery_type: 'manual', show_quantity: true, pick_items: false })}>I deliver by hand</button>
            </div>
            <p className="muted small">
              {own.delivery_type === 'stock'
                ? 'Every item is unique (an account, a login, a link or a file). Each purchase delivers the next unsold items automatically, one per quantity. This product keeps its own stock, separate from every other product.'
                : own.delivery_type === 'unlimited'
                ? 'One listing that never runs out. Every buyer receives the same link, text or files you add here. Nothing is used up, so there is no stock count.'
                : 'For services such as followers or custom work. The customer pays, the order appears in your dashboard with a countdown, and you deliver a message, links or files. The customer can contact support if you run late.'}
            </p>
            <label className="f"><span>Product name</span><input className="in" value={own.name} onChange={(e) => setOwn({ ...own, name: e.target.value })} /></label>
            <label className="f"><span>Icon image (optional)</span>
              <input className="in" type="file" accept="image/*" onChange={(e) => setOwn({ ...own, iconFile: e.target.files?.[0] ?? null })} /></label>
            <label className="f"><span>Category</span>
              <select className="in" value={own.category_id} onChange={(e) => setOwn({ ...own, category_id: e.target.value })}>
                <option value="">None</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            <div className="grid2">
              <label className="f"><span>Price customers pay (₦)</span><input className="in" inputMode="decimal" value={own.price_naira} onChange={(e) => setOwn({ ...own, price_naira: e.target.value })} /></label>
              <label className="f"><span>Your cost per item (₦, optional)</span><input className="in" inputMode="decimal" value={own.cost_naira} onChange={(e) => setOwn({ ...own, cost_naira: e.target.value })} /></label>
            </div>
            {own.delivery_type === 'unlimited' && (
              <>
                <label className="f"><span>Link(s) or text every buyer receives (one per line)</span>
                  <textarea className="in" style={{ minHeight: 110 }} value={own.shared_text} onChange={(e) => setOwn({ ...own, shared_text: e.target.value })} placeholder="https://your-link-here" /></label>
                <label className="f"><span>Files every buyer can download (optional, up to 50 MB each)</span>
                  <input className="in" type="file" multiple onChange={(e) => setOwn({ ...own, sharedFiles: Array.from(e.target.files ?? []) })} /></label>
              </>
            )}
            {own.delivery_type === 'manual' && (
              <label className="f"><span>Promised delivery time (hours)</span><input className="in" inputMode="numeric" value={own.delivery_hours} onChange={(e) => setOwn({ ...own, delivery_hours: e.target.value })} /></label>
            )}
            <label className="f"><span>Description</span><textarea className="in" value={own.description} onChange={(e) => setOwn({ ...own, description: e.target.value })} /></label>
            <label className="f"><span>Message shown after purchase (optional, e.g. “Thank you! Your order is being prepared.”)</span><textarea className="in" value={own.after_message} onChange={(e) => setOwn({ ...own, after_message: e.target.value })} /></label>
            <label className="f"><span>{own.delivery_type === 'manual' ? 'What you need from the customer (e.g. “Your TikTok username”)' : 'Ask the customer for (optional)'}</span><input className="in" value={own.input_label} onChange={(e) => setOwn({ ...own, input_label: e.target.value })} /></label>
            <label className="f"><span>Short note shown before buying (optional, e.g. “Do not change your username until delivery”)</span><input className="in" value={own.delivery_note} onChange={(e) => setOwn({ ...own, delivery_note: e.target.value })} /></label>
            {own.delivery_type === 'stock' && (
              <label className="check"><input type="checkbox" checked={!!own.pick_items} onChange={(e) => setOwn({ ...own, pick_items: e.target.checked })} /> Let customers choose which item they buy (like a list of numbers or accounts)</label>
            )}
            {!(own.delivery_type === 'stock' && own.pick_items) && (
              <label className="check"><input type="checkbox" checked={!!own.show_quantity} onChange={(e) => setOwn({ ...own, show_quantity: e.target.checked })} /> Show the quantity picker{own.delivery_type === 'stock' ? ' and the "available" count' : ''} to customers</label>
            )}
            <label className="f"><span>Badge (optional)</span><input className="in" value={own.badge} onChange={(e) => setOwn({ ...own, badge: e.target.value })} /></label>
            <div className="row"><button className="btn grow" disabled={busy} onClick={createOwn}>{busy ? 'Saving…' : 'Create product'}</button><button className="btn ghost" disabled={busy} onClick={() => setOwn(null)}>Cancel</button></div>
          </div>
        </div>
      )}

      {stockFor && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && setStockFor(null)}>
          <div className="sheet stack">
            <h2>Add stock</h2>
            <p className="muted small">{stockFor.display_name || stockFor.upstream_name} · {stockFor.stock} available now</p>
            <div className="chips">
              <button className={`chip ${stockTab === 'lines' ? 'on' : ''}`} onClick={() => setStockTab('lines')}>Text or links (many at once)</button>
              <button className={`chip ${stockTab === 'link' ? 'on' : ''}`} onClick={() => setStockTab('link')}>One link</button>
              <button className={`chip ${stockTab === 'file' ? 'on' : ''}`} onClick={() => setStockTab('file')}>One item with a file</button>
            </div>

            {stockTab === 'lines' ? (
              <>
                <label className="f"><span>{stockFor.pick_items ? 'One item per line as: label ## details (up to 500 at a time)' : 'One item per line (up to 500 at a time)'}</span>
                  <textarea className="in" style={{ minHeight: 170 }} value={stockText} onChange={(e) => setStockText(e.target.value)}
                    placeholder={stockFor.pick_items ? '(347) 746-7908 ## login: user1 / pass: abc123\n(678) 404-9826 ## https://link-to-the-item' : 'email1@example.com | password1\nhttps://link-to-the-item'} />
                </label>
                {stockFor.pick_items && <p className="muted small">The label before ## is shown to customers in the list. Everything after ## (a login, a link) is only shown to the person who buys that item.</p>}
                <p className="muted small">{stockText.split('\n').filter((l) => l.trim()).length} items ready. Each line is one unique item and is encrypted.</p>
                <div className="row">
                  <button className="btn grow" disabled={busy || !stockText.trim()} onClick={addStock}>{busy ? 'Adding…' : 'Add to stock'}</button>
                  <button className="btn ghost" disabled={busy} onClick={() => setStockFor(null)}>Cancel</button>
                </div>
              </>
            ) : stockTab === 'link' ? (
              <>
                <p className="muted small">For an item that is a link, such as a download page, a private group or a shared folder. The buyer gets a button that opens it.</p>
                <label className="f"><span>{stockFor.pick_items ? 'Label customers see before buying' : 'Label (optional, only you see it)'}</span><input className="in" value={lLabel} onChange={(e) => setLLabel(e.target.value)} /></label>
                <label className="f"><span>Link</span><input className="in" inputMode="url" placeholder="https://" value={lUrl} onChange={(e) => setLUrl(e.target.value)} /></label>
                <div className="row">
                  <button className="btn grow" disabled={busy || !lUrl.trim()} onClick={addStockLink}>{busy ? 'Adding…' : 'Add link'}</button>
                  <button className="btn ghost" disabled={busy} onClick={() => setStockFor(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <p className="muted small">For an item that is a file: a .zip, image, video, document and so on (up to 50 MB). The buyer gets a private download button. You can add text or a link as well.</p>
                {stockFor.pick_items && <label className="f"><span>Label customers see before buying</span><input className="in" value={fLabel} onChange={(e) => setFLabel(e.target.value)} /></label>}
                {!stockFor.pick_items && <label className="f"><span>Label (optional, only you see it)</span><input className="in" value={fLabel} onChange={(e) => setFLabel(e.target.value)} /></label>}
                <label className="f"><span>Text or link delivered with the file (optional)</span><textarea className="in" value={fDetails} onChange={(e) => setFDetails(e.target.value)} /></label>
                <label className="f"><span>File</span><input className="in" type="file" onChange={(e) => setFFile(e.target.files?.[0] ?? null)} /></label>
                {fFile && <p className="muted small">{fFile.name} · {(fFile.size / 1048576).toFixed(1)} MB</p>}
                <div className="row">
                  <button className="btn grow" disabled={busy || !fFile} onClick={addStockFile}>{busy ? 'Uploading…' : 'Upload item'}</button>
                  <button className="btn ghost" disabled={busy} onClick={() => setStockFor(null)}>Cancel</button>
                </div>
              </>
            )}
            <button className="btn danger block" disabled={busy} onClick={clearStock}>Remove all unsold items</button>
          </div>
        </div>
      )}

      {sharedFor && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && setSharedFor(null)}>
          <div className="sheet stack">
            <h2>Content every buyer receives</h2>
            <p className="muted small">{sharedFor.display_name || sharedFor.upstream_name} · sold again and again, nothing runs out</p>
            {sharedLoading ? <p className="muted">Loading…</p> : (
              <>
                <label className="f"><span>Link(s) or text (one per line)</span>
                  <textarea className="in" style={{ minHeight: 120 }} value={sharedText} onChange={(e) => setSharedText(e.target.value)} placeholder="https://your-link-here" /></label>
                {sharedText.trim() && <p className="muted small">Buyers see: <Linkify text={sharedText.split('\n')[0]} /></p>}
                {sharedFiles.length > 0 && (
                  <div className="stack-s">
                    <b className="small">Files buyers can download</b>
                    {sharedFiles.map((f) => (
                      <div key={f.id} className="row between">
                        <span className="small">📎 {f.name}</span>
                        <button className="btn sm ghost" disabled={busy} onClick={() => removeSharedFile(f.id)}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}
                <label className="f"><span>Add files (up to 50 MB each)</span>
                  <input className="in" type="file" multiple onChange={(e) => setSharedNew(Array.from(e.target.files ?? []))} /></label>
                {sharedNew.length > 0 && <p className="muted small">{sharedNew.map((f) => `${f.name} (${(f.size / 1048576).toFixed(1)} MB)`).join(' · ')}</p>}
                <div className="row">
                  <button className="btn grow" disabled={busy} onClick={saveShared}>{busy ? 'Saving…' : 'Save content'}</button>
                  <button className="btn ghost" disabled={busy} onClick={() => setSharedFor(null)}>Close</button>
                </div>
                <p className="muted small">New buyers get the latest content straight away. People who already bought keep what they received.</p>
              </>
            )}
          </div>
        </div>
      )}

      {viewStock && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && setViewStock(null)}>
          <div className="sheet stack">
            <div className="row between"><h2>Stock</h2><button className="btn sm ghost" onClick={() => setViewStock(null)}>Close</button></div>
            <p className="muted small">
              {viewStock.display_name || viewStock.upstream_name} · {stockRows.filter((r) => r.status === 'available').length} available · {stockRows.filter((r) => r.status === 'sold').length} sold (latest 300 shown)
            </p>
            {stockLoading ? <p className="muted">Loading…</p> : stockRows.length === 0 ? <div className="empty">No items yet.</div> : (
              <div className="list" style={{ border: '1px solid var(--line)', borderRadius: 12 }}>
                {stockRows.map((r) => (
                  <div key={r.id} className="stack-s">
                    <div className="row between">
                      <div className="grow">
                        {r.label && <b>{r.label}</b>}
                        {r.details && <div className="mono small"><Linkify text={r.details} /></div>}
                        {r.file_name && <div className="small">📎 {r.file_name}</div>}
                      </div>
                      <span className={`badge ${r.status === 'available' ? 'on' : 'off'}`}>{r.status === 'available' ? 'Available' : 'Sold'}</span>
                    </div>
                    {r.status === 'available' && <button className="btn sm ghost" onClick={() => removeItem(r.id)}>Remove</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
