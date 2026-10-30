import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function AdminCategories() {
  const [cats, setCats] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const { data } = await supabase.from('categories').select('*').order('sort_order').order('id');
    setCats(data ?? []);
  }
  useEffect(() => { void load(); }, []);

  async function add() {
    if (!name.trim()) return;
    const { error } = await supabase.from('categories').insert({ name: name.trim(), slug: slugify(name) || `cat-${Date.now()}`, sort_order: cats.length + 1 });
    setMsg(error ? error.message : '');
    setName('');
    await load();
  }
  async function patch(id: number, p: Record<string, unknown>) {
    await supabase.from('categories').update(p).eq('id', id);
    await load();
  }
  async function remove(c: any) {
    if (!confirm(`Delete category "${c.name}"? Its products will become uncategorised.`)) return;
    await supabase.from('categories').delete().eq('id', c.id);
    await load();
  }

  return (
    <>
      <h1 style={{ fontSize: '1.8rem' }}>Categories</h1>
      <div className="panel stack">
        <h2>Add a category</h2>
        <div className="row">
          <input className="in" placeholder="e.g. Telegram" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" onClick={add}>Add</button>
        </div>
        {msg && <div className="notice bad">{msg}</div>}
      </div>
      <div className="panel flat list">
        {cats.map((c) => (
          <div className="row wrap" key={c.id}>
            <input className="in grow" defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && patch(c.id, { name: e.target.value })} />
            <input className="in" style={{ width: 80 }} inputMode="numeric" title="Sort order" defaultValue={c.sort_order} onBlur={(e) => patch(c.id, { sort_order: Number(e.target.value) || 0 })} />
            <button className={`toggle ${c.is_active ? 'on' : ''}`} aria-label="Visible" onClick={() => patch(c.id, { is_active: !c.is_active })} />
            <button className="btn sm ghost" onClick={() => remove(c)}>Delete</button>
          </div>
        ))}
        {cats.length === 0 && <div className="empty">No categories yet. Sync products or add one above.</div>}
      </div>
      <p className="muted small">Edit a name or sort order and tap outside the box to save. The switch shows or hides the category on the store.</p>
    </>
  );
}
