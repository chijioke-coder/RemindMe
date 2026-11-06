import { useState } from 'react';
import { useAuth } from '../lib/auth';
import Icon from './Icon';

// Remembered only until the page is reloaded, so the card comes back every time the site is opened afresh.
let dismissedText = '';

/** The owner's announcement, shown as a card on Home and My account instead of a banner on every page. */
export default function AnnouncementCard() {
  const { settings } = useAuth();
  const text = settings?.announcement?.trim() ?? '';
  const [, rerender] = useState(0);

  if (!text || dismissedText === text) return null;

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
      <button className="x" aria-label="Close" onClick={() => { dismissedText = text; rerender((n) => n + 1); }}><Icon name="x" size={18} /></button>
    </div>
  );
}
