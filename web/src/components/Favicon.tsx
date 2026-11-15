import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { iconUrl } from '../lib/images';

/** Puts the favicon chosen in Admin → Settings into the browser tab. Renders nothing. */
export default function Favicon() {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.from('public_branding').select('favicon_path').maybeSingle();
        const url = iconUrl(data?.favicon_path);
        if (!url || cancelled) return;
        for (const rel of ['icon', 'apple-touch-icon']) {
          let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
          if (!link) { link = document.createElement('link'); link.rel = rel; document.head.appendChild(link); }
          link.type = 'image/png';
          link.href = url;
        }
      } catch { /* the default icon stays */ }
    })();
    return () => { cancelled = true; };
  }, []);
  return null;
}
