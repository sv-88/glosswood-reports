// Plain-English summaries, built from rules so they are always consistent with the numbers on the page.
import { fmtNum, fmtPct, fmtDate } from './range';
import type { Forms, TrafficData, EnquiryData } from './reports';

const change = (a: number, b: number | null | undefined, noun: string, prevLabel: string) => {
  if (b === null || b === undefined) return '';
  if (b === 0) return a === 0 ? ` That is the same as ${prevLabel}.` : ` There were none in ${prevLabel}.`;
  const p = ((a - b) / b) * 100;
  if (Math.abs(p) < 1) return ` That is about the same as ${prevLabel} (${fmtNum(b)}).`;
  return ` That is ${Math.abs(Math.round(p))}% ${p > 0 ? 'higher' : 'lower'} than ${prevLabel} (${fmtNum(b)} ${noun}).`;
};
const plural = (n: number, w: string) => `${fmtNum(n)} ${w}${n === 1 ? '' : 's'}`;

export function formsTakeaway(f: Forms): string[] {
  const { cur, prev, prevRange } = f;
  const pl = `${fmtDate(prevRange.from)} – ${fmtDate(prevRange.to)}`;
  if (cur.total === 0) return ['No form submissions were received in this period.'];
  const out = [
    `Glosswood received ${plural(cur.total, 'form submission')}: ${plural(cur.sample, 'sample request')} and ${fmtNum(cur.contact)} contact ${cur.contact === 1 ? 'enquiry' : 'enquiries'}.` +
      change(cur.total, prev?.total, 'submissions', pl),
  ];
  const top = cur.states[0];
  if (top) out.push(`${top.label} sent the most (${fmtNum(top.n)} of ${fmtNum(cur.total)}).`);
  const p = cur.products[0];
  if (p) out.push(`The most requested product was ${p.label} (${fmtNum(p.n)} sample requests).`);
  return out;
}

export function trafficTakeaway(d: TrafficData): string[] {
  const { cur, prev, prevRange } = d;
  const pl = `${fmtDate(prevRange.from)} – ${fmtDate(prevRange.to)}`;
  if (cur.sessions === 0) return ['No website visits were recorded in this period.'];
  const out = [
    `The website had ${plural(cur.sessions, 'visit')} (sessions) from ${plural(cur.users, 'visitor')}.` + change(cur.sessions, prev?.sessions, 'sessions', pl),
  ];
  const ch = cur.channels[0];
  if (ch) out.push(`${ch.label} brought the most traffic: ${fmtPct(ch.n / cur.sessions)} of visits.`);
  const pg = cur.pages[0];
  if (pg) out.push(`The most viewed page was ${pg.path} (${fmtNum(pg.views)} views).`);
  return out;
}

export const enquiryRate = (n: number, sessions: number) => (sessions > 0 ? n / sessions : 0);

export function enquiryTakeaway(d: EnquiryData): string[] {
  const { forms, sessions, prevSessions, ga, channels } = d;
  const total = forms.cur.total;
  if (sessions === 0) return ['No website visits were recorded in this period, so a conversion rate can not be worked out.'];
  const rate = enquiryRate(total, sessions);
  let line = `${plural(total, 'form submission')} from ${plural(sessions, 'visit')} is a conversion rate of ${fmtPct(rate)}.`;
  if (forms.prev && prevSessions) {
    const pr = enquiryRate(forms.prev.total, prevSessions);
    const diff = (rate - pr) * 100;
    line += Math.abs(diff) < 0.05 ? ' That is about the same as the previous period.' : ` The previous period was ${fmtPct(pr)}, so the rate is ${diff > 0 ? 'up' : 'down'} ${Math.abs(diff).toFixed(1)} percentage points.`;
  }
  const out = [line];
  const best = channels.filter((c) => c.sample + c.contact > 0)[0];
  if (best) out.push(`${best.channel} produced the most enquiries in Google Analytics (${fmtNum(best.sample)} sample requests, ${fmtNum(best.contact)} contact enquiries).`);
  const gaTotal = ga.sample + ga.contact;
  const gap = total === 0 ? 0 : Math.abs(gaTotal - total) / total;
  if (gap > 0.15) out.push(`Webflow (${fmtNum(total)}) and Google Analytics (${fmtNum(gaTotal)}) differ by more than usual; see "Why the counts can differ" below.`);
  return out;
}
