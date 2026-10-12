import { dayKey, shiftDay } from './aggregate';

export type Range = { from: string; to: string };
const valid = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

export function today() {
  return dayKey(Date.now());
}

/** Every report opens on "this month" unless the URL says otherwise. */
export function parseRange(url: URL): { range: Range; compare: boolean } {
  const t = today();
  let from = url.searchParams.get('from');
  let to = url.searchParams.get('to');
  if (!valid(from) || !valid(to) || from! > to!) {
    from = t.slice(0, 8) + '01';
    to = t;
  }
  if (to! > t) to = t;
  return { range: { from: from!, to: to! }, compare: url.searchParams.get('compare') !== '0' };
}

export function presets() {
  const t = today();
  const monthStart = t.slice(0, 8) + '01';
  const lastMonthEnd = shiftDay(monthStart, -1);
  return [
    { label: 'This month', from: monthStart, to: t },
    { label: 'Last month', from: lastMonthEnd.slice(0, 8) + '01', to: lastMonthEnd },
    { label: 'Last 30 days', from: shiftDay(t, -29), to: t },
    { label: 'Last 90 days', from: shiftDay(t, -89), to: t },
    { label: 'Year to date', from: t.slice(0, 4) + '-01-01', to: t },
  ];
}

export const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const fmtBucket = (k: string, unit: string) =>
  unit === 'day'
    ? new Date(k + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    : new Date(k + '-01T00:00:00Z').toLocaleDateString('en-AU', { month: 'short', year: 'numeric', timeZone: 'UTC' });
export const fmtNum = (n: number) => n.toLocaleString('en-AU');
export const fmtPct = (x: number) => (x * 100).toLocaleString('en-AU', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + '%';
