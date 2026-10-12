// Loads the data behind each report. Website analytics (GA4) failing never breaks the forms report.
import { loadSubmissions } from './data';
import { summarise, previousRange } from './aggregate';
import { ga4Configured, getThankYou, getTraffic, type Thanks, type Traffic } from './ga4';
import type { Env } from './env';
import type { Range } from './range';

export type Forms = { cur: ReturnType<typeof summarise>; prev: ReturnType<typeof summarise> | null; prevRange: Range };
export type Loaded<T> = { ok: true; data: T } | { ok: false; msg: string };

const NOT_CONNECTED = "Website analytics isn't connected yet, so this report can't be shown.";
const FAILED = 'Website analytics could not be loaded just now. Please try again shortly.';

export async function loadForms(env: Env, range: Range, compare: boolean): Promise<Loaded<Forms>> {
  try {
    const subs = await loadSubmissions(env);
    const prevRange = previousRange(range);
    return { ok: true, data: { cur: summarise(subs, range), prev: compare ? summarise(subs, prevRange) : null, prevRange } };
  } catch {
    return { ok: false, msg: 'The report could not load the latest submissions. Please try again shortly.' };
  }
}

export type TrafficData = { cur: Traffic; prev: Traffic | null; prevRange: Range };

export async function loadTraffic(env: Env, range: Range, compare: boolean): Promise<Loaded<TrafficData>> {
  if (!ga4Configured(env)) return { ok: false, msg: NOT_CONNECTED };
  try {
    const prevRange = previousRange(range);
    const [cur, prev] = await Promise.all([getTraffic(env, range), compare ? getTraffic(env, prevRange) : null]);
    return { ok: true, data: { cur, prev, prevRange } };
  } catch {
    return { ok: false, msg: FAILED };
  }
}

export type ChannelRow = { channel: string; sessions: number; sample: number; contact: number };
export type EnquiryData = {
  forms: Forms;
  sessions: number;
  prevSessions: number | null;
  ga: Thanks;
  channels: ChannelRow[];
};

export async function loadEnquiry(env: Env, range: Range, compare: boolean): Promise<Loaded<EnquiryData>> {
  const forms = await loadForms(env, range, compare);
  if (!forms.ok) return forms;
  if (!ga4Configured(env)) return { ok: false, msg: NOT_CONNECTED };
  try {
    const [t, ga, pt] = await Promise.all([
      getTraffic(env, range),
      getThankYou(env, range),
      compare ? getTraffic(env, forms.data.prevRange) : null,
    ]);
    const names = new Set([...t.channels.map((c) => c.label), ...Object.keys(ga.byChannel)]);
    const channels = [...names]
      .map((channel) => ({
        channel,
        sessions: t.channels.find((c) => c.label === channel)?.n ?? 0,
        sample: ga.byChannel[channel]?.sample ?? 0,
        contact: ga.byChannel[channel]?.contact ?? 0,
      }))
      .sort((a, b) => b.sample + b.contact - (a.sample + a.contact) || b.sessions - a.sessions);
    return { ok: true, data: { forms: forms.data, sessions: t.sessions, prevSessions: pt ? pt.sessions : null, ga, channels } };
  } catch {
    return { ok: false, msg: FAILED };
  }
}
