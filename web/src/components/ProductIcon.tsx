import { hueFor, initials } from '../lib/format';
import { iconUrl } from '../lib/images';

export default function ProductIcon({ path, label, seed, size = 46 }: { path?: string | null; label: string; seed: string | number; size?: number }) {
  const url = iconUrl(path);
  const style = { width: size, height: size, ...(url ? {} : { background: `hsl(${hueFor(seed)} 55% 36%)` }) };
  return (
    <div className="tile" style={style}>
      {url ? <img src={url} alt="" loading="lazy" /> : initials(label)}
    </div>
  );
}
