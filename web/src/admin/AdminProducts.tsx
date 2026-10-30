import { useEffect, useState } from 'react';
import { callApi, supabase } from '../lib/supabase';
import { naira } from '../lib/format';

export default function AdminProducts() {
  const [products, setProducts] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [show, setShow] = useState<'all' | 'active' | 'hidden'>('all');
  const [edit, setEdit] = useState<any | null>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    const [p, c] = await Promise.all([
      supabase.from('products').select('*').order('id', { ascending: false }),
      supabase.from('categories').select('*').order('sort_order'),
    ]);
    setProducts(p.data ?? []);
    setCats(c.data ?? []);
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

  async function save() {
    const e = edit;
    const override = e.override_naira === '' ? null : Math.round(Number(e.override_naira) * 100);
    const { error } = await supabase.from('products').update({
      display_name: e.display_name || null,
      category_id: e.category_id ? Number(e.category_id) : null,
      markup_percent: e.markup_percent === '' ? null : Number(e.markup_percent),
      price_override_kobo: override,
      badge: e.badge || null,
      description: e.description || null,
      sort_order: Number(e.sort_order) || 0,
    }).eq('id', e.id);
    if (error) return setMsg({ kind: 'bad', text: error.message });
    setEdit(null);
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

  return (
    <>
      <div className="row between wrap">
        <h1 style={{ fontSize: '1.8rem' }}>Products</h1>
        <button className="btn" disabled={syncing} onClick={sync}>{syncing ? 'Syncing…' : 'Sync from supplier'}</button>
      </div>
      {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
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

      <div className="panel flat scroll-x">
        <table className="tbl">
          <thead><tr><th>Product</th><th>Cost</th><th>Price</th><th>Stock</th><th>On sale</th><th></th></tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id}>
                <td>
                  <b>{p.display_name || p.upstream_name}</b>
                  <div className="muted small">{cats.find((c) => c.id === p.category_id)?.name ?? 'No category'}{p.upstream_missing && ' · gone from supplier'}</div>
                </td>
                <td>{naira(p.upstream_price_kobo)}</td>
                <td><b>{naira(p.sell_price_kobo)}</b>
                  <div className="muted small">{p.price_override_kobo != null ? 'fixed' : `+${p.markup_percent ?? 'default'}%`}</div></td>
                <td>{p.stock}</td>
                <td><button className={`toggle ${p.is_active ? 'on' : ''}`} aria-label="Toggle on sale" onClick={() => toggle(p)} /></td>
                <td className="row" style={{ gap: 6 }}>
                  <button className="btn sm ghost" onClick={() => setEdit({ ...p, display_name: p.display_name ?? '', markup_percent: p.markup_percent ?? '', override_naira: p.price_override_kobo != null ? p.price_override_kobo / 100 : '', badge: p.badge ?? '', description: p.description ?? '', category_id: p.category_id ?? '' })}>Edit</button>
                  <button className="btn sm ghost" onClick={() => remove(p)}>Delete</button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={6} className="empty">No products. Tap “Sync from supplier” to import them.</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && setEdit(null)}>
          <div className="sheet stack">
            <h2>Edit product</h2>
            <p className="muted small">Supplier name: {edit.upstream_name} · cost {naira(edit.upstream_price_kobo)}</p>
            <label className="f"><span>Name shown to customers</span><input className="in" value={edit.display_name} onChange={(e) => setEdit({ ...edit, display_name: e.target.value })} /></label>
            <label className="f"><span>Category</span>
              <select className="in" value={edit.category_id} onChange={(e) => setEdit({ ...edit, category_id: e.target.value })}>
                <option value="">None</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            <div className="grid2">
              <label className="f"><span>Markup % (blank = default)</span><input className="in" inputMode="decimal" value={edit.markup_percent} onChange={(e) => setEdit({ ...edit, markup_percent: e.target.value })} /></label>
              <label className="f"><span>Fixed price ₦ (blank = use markup)</span><input className="in" inputMode="decimal" value={edit.override_naira} onChange={(e) => setEdit({ ...edit, override_naira: e.target.value })} /></label>
            </div>
            <div className="grid2">
              <label className="f"><span>Badge (e.g. Hot)</span><input className="in" value={edit.badge} onChange={(e) => setEdit({ ...edit, badge: e.target.value })} /></label>
              <label className="f"><span>Sort order</span><input className="in" inputMode="numeric" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: e.target.value })} /></label>
            </div>
            <label className="f"><span>Description</span><textarea className="in" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></label>
            <div className="row"><button className="btn grow" onClick={save}>Save changes</button><button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div>
          </div>
        </div>
      )}
    </>
  );
}
