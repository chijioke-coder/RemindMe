import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { dateTime } from '../lib/format';

export default function AdminActivity() {
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    supabase.from('activity_log').select('*, profiles(email)').order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => setRows(data ?? []));
  }, []);

  const shown = rows.filter((r) => !filter || r.action.startsWith(filter));
  return (
    <>
      <h1 style={{ fontSize: '1.8rem' }}>Customer activity</h1>
      <div className="chips">
        {[['', 'Everything'], ['login', 'Logins'], ['signup', 'Sign-ups'], ['order', 'Orders'], ['topup', 'Funding'], ['keys', 'Details viewed'], ['admin', 'Admin actions']].map(([v, l]) => (
          <button key={v} className={`chip ${filter === v ? 'on' : ''}`} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>
      <div className="panel flat list">
        {shown.map((r) => (
          <div key={r.id} className="stack-s">
            <div className="row between">
              <div className="grow"><span className="mono">{r.action}</span><div className="muted small">{r.profiles?.email ?? 'system'}</div></div>
              <span className="muted small">{dateTime(r.created_at)}</span>
            </div>
            {r.meta && Object.keys(r.meta).length > 0 && <div className="muted small mono">{JSON.stringify(r.meta)}</div>}
          </div>
        ))}
        {shown.length === 0 && <div className="empty">Nothing here yet.</div>}
      </div>
    </>
  );
}
