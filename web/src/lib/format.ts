const ngn = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 });

/** kobo → "₦3,500.00" (drops .00 for whole naira). */
export function naira(kobo: number | null | undefined): string {
  const v = Number(kobo ?? 0) / 100;
  return ngn.format(v).replace(/\.00$/, '');
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

const HUES = [172, 24, 205, 340, 45, 262, 130, 8];
export function hueFor(key: string | number): number {
  const s = String(key);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

export const STATUS_LABEL: Record<string, string> = {
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed · refunded',
  refunded: 'Refunded',
  needs_review: 'Needs review',
};
