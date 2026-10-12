// Pure functions: turn raw submissions into the numbers the report shows.
// All dates are grouped in Perth time (AWST, UTC+8, no daylight saving).

export type Sub = {
  t: number; // epoch ms (UTC)
  form: 'Sample request' | 'Contact';
  state: string;
  category: string;
  page: string;
  products: string[];
  finishes: string[];
};

const AWST = 8 * 3600e3;
const NON_PRODUCT = new Set([
  'First Name', 'Last Name', 'Email', 'Phone', 'Address', 'State', 'Postcode',
  'Finishes', 'Category', 'Form Message', 'Form-Message', 'Checkbox', 'Interested Product', '0',
]);

export const dayKey = (t: number) => new Date(t + AWST).toISOString().slice(0, 10);
export const monthKey = (t: number) => dayKey(t).slice(0, 7);
export const dayToTime = (d: string) => Date.parse(d + 'T00:00:00Z') - AWST; // start of that Perth day, as UTC ms

export function normaliseState(s: unknown): string {
  const v = String(s ?? '').trim().toUpperCase();
  return v || 'Unknown';
}

const titleCase = (s: string) => s.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** Webflow form submission (REST v2 shape) -> Sub. Returns null for other forms. */
export function fromLive(r: any): Sub | null {
  const name = String(r.displayName ?? '');
  const fr = r.formResponse ?? {};
  const t = Date.parse(r.dateSubmitted);
  if (!Number.isFinite(t)) return null;
  const isSample = /sample/i.test(name);
  const isContact = /contact/i.test(name);
  if (!isSample && !isContact) return null;
  const products = isSample
    ? Object.entries(fr).filter(([k, v]) => !NON_PRODUCT.has(k) && (v === true || v === 'true')).map(([k]) => k)
    : [];
  const finishes = isSample
    ? [...new Set(String(fr.Finishes ?? '').split(',').map(titleCase).filter(Boolean))]
    : [];
  return {
    t,
    form: isSample ? 'Sample request' : 'Contact',
    state: normaliseState(fr.State),
    category: isSample ? String(fr.Category || 'Not asked') : 'Not asked',
    page: r.publishedPath || 'Not recorded',
    products,
    finishes,
  };
}

/**
 * Contact enquiries from a manual Webflow export. The API does not hold everything (older form
 * versions are missing), so keep every export row that has no live match at the same second.
 */
export function mergeBackfill(live: Sub[], backfill: { t: string; state: string }[]): Sub[] {
  const seen = new Set(live.filter((s) => s.form === 'Contact').map((s) => Math.floor(s.t / 1000)));
  const extra: Sub[] = backfill
    .map((b) => ({ t: Date.parse(b.t), form: 'Contact' as const, state: normaliseState(b.state), category: 'Not asked', page: 'Not recorded', products: [] as string[], finishes: [] as string[] }))
    .filter((s) => !seen.has(Math.floor(s.t / 1000)));
  return [...extra, ...live].sort((a, b) => a.t - b.t);
}

export type Range = { from: string; to: string }; // YYYY-MM-DD inclusive, Perth time

export const inRange = (s: Sub, r: Range) => {
  const d = dayKey(s.t);
  return d >= r.from && d <= r.to;
};

export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400e3) + 1;
}

export function shiftDay(d: string, n: number) {
  return new Date(Date.parse(d) + n * 86400e3).toISOString().slice(0, 10);
}

export function previousRange(r: Range): Range {
  const n = daysBetween(r.from, r.to);
  return { from: shiftDay(r.from, -n), to: shiftDay(r.from, -1) };
}

const tally = (xs: string[]) =>
  Object.entries(xs.reduce<Record<string, number>>((m, k) => ((m[k] = (m[k] || 0) + 1), m), {}))
    .map(([label, n]) => ({ label, n }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));

export type Bucket = { key: string; sample: number; contact: number };

export function summarise(all: Sub[], r: Range) {
  const subs = all.filter((s) => inRange(s, r));
  const samples = subs.filter((s) => s.form === 'Sample request');
  const days = daysBetween(r.from, r.to);
  const unit: 'day' | 'month' = days <= 31 ? 'day' : 'month';
  const keyOf = (s: Sub) => (unit === 'day' ? dayKey(s.t) : monthKey(s.t));
  const buckets: Record<string, Bucket> = {};
  for (const s of subs) {
    const k = keyOf(s);
    const b = (buckets[k] ??= { key: k, sample: 0, contact: 0 });
    if (s.form === 'Sample request') b.sample++; else b.contact++;
  }
  // include empty days so the day chart has no gaps
  if (unit === 'day') for (let i = 0; i < days; i++) { const k = shiftDay(r.from, i); buckets[k] ??= { key: k, sample: 0, contact: 0 }; }
  return {
    total: subs.length,
    sample: samples.length,
    contact: subs.length - samples.length,
    unit,
    buckets: Object.values(buckets).sort((a, b) => a.key.localeCompare(b.key)),
    states: tally(subs.map((s) => s.state)),
    categories: tally(samples.map((s) => s.category)),
    products: tally(samples.flatMap((s) => s.products)).slice(0, 12),
    finishes: tally(samples.flatMap((s) => s.finishes)).slice(0, 12),
    pages: Object.entries(subs.reduce<Record<string, number>>((m, s) => { const k = s.page + '\u0000' + s.form; m[k] = (m[k] || 0) + 1; return m; }, {}))
      .map(([k, n]) => { const [page, form] = k.split('\u0000'); return { page, form, n }; })
      .sort((a, b) => b.n - a.n || a.page.localeCompare(b.page)),
  };
}
