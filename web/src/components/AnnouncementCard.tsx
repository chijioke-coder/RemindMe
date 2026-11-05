import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import Icon from './Icon';

/** The owner's announcement, shown as a card on Home and My account instead of a banner on every page. */
export default function AnnouncementCard() {
  const { settings } = useAuth();
  const text = settings?.announcement?.trim() ?? '';
  const key = text ? `pabs_ann_${text.length}_${text.slice(0, 16)}` : '';
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try { setHidden(key ? localStorage.getItem(key) === '1' : false); } catch { setHidden(false); }
  }, [key]);

  if (!text || hidden) return null;

  const m = text.match(/https?:\/\/\S+/);
  const url = m ? m[0].replace(/[.,;:!?)]+$/, '') : null;
  const body = (url ? text.replace(m![0], '') : text).replace(/[\s:–-]+$/, '').trim();
  const label = !url ? '' : /t\.me|telegram/i.test(url) ? 'Join on Telegram' : /wa\.me|whatsapp/i.test(url) ? 'Open WhatsApp' : 'Open link';

  return (
    <div className="announce">
      <div className="ic"><Icon name="bell" size={20} /></div>
      <div className="grow">
        <div className="eyebrow dark" style={{ marginBottom: 2 }}>Latest from us</div>
        <p>{body || text}</p>
      </div>
      {url && <a className="btn sm gold" href={url} target="_blank" rel="noreferrer">{label}</a>}
      <button className="x" aria-label="Dismiss" onClick={() => { try { localStorage.setItem(key, '1'); } catch { /* ignore */ } setHidden(true); }}><Icon name="x" size={18} /></button>
    </div>
  );
}
