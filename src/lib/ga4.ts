// Google Analytics 4 (Data API) client using a service account. Works on Cloudflare Workers (WebCrypto only).
import { dayKey, daysBetween, shiftDay } from './aggregate';
import type { Env } from './env';
import type { Range } from './range';

export const THANK_YOU = { sample: '/thank-you-sample', contact: '/thank-you-contact' } as const;

type SA = { client_email: string; private_key: string; token_uri?: string };

const b64url = (b: ArrayBuffer | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b);
  let s = '';
  bytes.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export function parseServiceAccount(json: string): SA {
  const sa = JSON.parse(json);
  if (!sa.client_email || !sa.private_key) throw new Error('GA4 key is missing client_email or private_key');
  return { ...sa, private_key: String(sa.private_key).replace(/\\n/g, '\n') };
}

export async function signJwt(sa: SA, now = Math.floor(Date.now() / 1000)) {
  const pem = sa.private_key.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claim}`));
  return `${head}.${claim}.${b64url(sig)}`;
}

let tokenCache: { token: string; exp: number } | null = null;
async function accessToken(sa: SA) {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const res = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: await signJwt(sa) }),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}`);
  const j: any = await res.json();
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}

export type Row = Record<string, string | number>;
type Query = { dimensions?: string[]; metrics: string[]; range: Range; inList?: { field: string; values: string[] }; orderMetric?: string; limit?: number };

/** Turn a GA4 runReport response into plain row objects. */
export function parseReport(j: any): Row[] {
  const dims: string[] = (j.dimensionHeaders ?? []).map((h: any) => h.name);
  const mets: string[] = (j.metricHeaders ?? []).map((h: any) => h.name);
  return (j.rows ?? []).map((r: any) => {
    const o: Row = {};
    dims.forEach((d, i) => (o[d] = r.dimensionValues[i].value));
    mets.forEach((m, i) => (o[m] = Number(r.metricValues[i].value)));
    return o;
  });
}

function body(q: Query) {
  return {
    dateRanges: [{ startDate: q.range.from, endDate: q.range.to }],
    dimensions: (q.dimensions ?? []).map((name) => ({ name })),
    metrics: q.metrics.map((name) => ({ name })),
    ...(q.inList ? { dimensionFilter: { filter: { fieldName: q.inList.field, inListFilter: { values: q.inList.values } } } } : {}),
    ...(q.orderMetric ? { orderBys: [{ metric: { metricName: q.orderMetric }, desc: true }] } : {}),
    limit: q.limit ?? 10000,
  };
}

async function runReport(env: Env, q: Query): Promise<Row[]> {
  if (env.DEMO_DATA) return demoReport(q);
  const sa = parseServiceAccount(env.GA4_SERVICE_ACCOUNT_JSON!);
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_PROPERTY_ID}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken(sa)}`, 'content-type': 'application/json' },
    body: JSON.stringify(body(q)),
  });
  if (!res.ok) throw new Error(`GA4 ${res.status}`);
  return parseReport(await res.json());
}

export const ga4Configured = (env: Env) => !!env.DEMO_DATA || !!(env.GA4_PROPERTY_ID && env.GA4_SERVICE_ACCOUNT_JSON);

const cache = new Map<string, { at: number; v: any }>();
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 300_000) return hit.v;
  const v = await fn();
  cache.set(key, { at: Date.now(), v });
  return v;
}

const ymd = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

export type Traffic = {
  sessions: number;
  users: number;
  unit: 'day' | 'month';
  buckets: { key: string; sessions: number }[];
  channels: { label: string; n: number }[];
  pages: { path: string; views: number; users: number }[];
};

export async function getTraffic(env: Env, range: Range): Promise<Traffic> {
  const k = `t:${range.from}:${range.to}`;
  return cached(k, async () => {
    const [totals, daily, channels, pages] = await Promise.all([
      runReport(env, { metrics: ['sessions', 'totalUsers'], range }),
      runReport(env, { dimensions: ['date'], metrics: ['sessions'], range }),
      runReport(env, { dimensions: ['sessionDefaultChannelGroup'], metrics: ['sessions'], range, orderMetric: 'sessions' }),
      runReport(env, { dimensions: ['pagePath'], metrics: ['screenPageViews', 'totalUsers'], range, orderMetric: 'screenPageViews', limit: 40 }),
    ]);
    const unit: 'day' | 'month' = daysBetween(range.from, range.to) <= 31 ? 'day' : 'month';
    const m: Record<string, number> = {};
    for (const r of daily) {
      const d = ymd(String(r.date));
      const key = unit === 'day' ? d : d.slice(0, 7);
      m[key] = (m[key] || 0) + Number(r.sessions);
    }
    if (unit === 'day') for (let i = 0; i < daysBetween(range.from, range.to); i++) m[shiftDay(range.from, i)] ??= 0;
    return {
      sessions: Number(totals[0]?.sessions ?? 0),
      users: Number(totals[0]?.totalUsers ?? 0),
      unit,
      buckets: Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([key, sessions]) => ({ key, sessions })),
      channels: channels.map((r) => ({ label: String(r.sessionDefaultChannelGroup), n: Number(r.sessions) })),
      pages: pages
        .filter((r) => !String(r.pagePath).startsWith('/thank-you'))
        .slice(0, 15)
        .map((r) => ({ path: String(r.pagePath), views: Number(r.screenPageViews), users: Number(r.totalUsers) })),
    };
  });
}

export type Thanks = { sample: number; contact: number; byChannel: Record<string, { sample: number; contact: number }> };

/** Visits to the two thank-you pages, which is how GA4 sees a completed form. */
export async function getThankYou(env: Env, range: Range): Promise<Thanks> {
  return cached(`y:${range.from}:${range.to}`, async () => {
    const rows = await runReport(env, {
      dimensions: ['sessionDefaultChannelGroup', 'pagePath'],
      metrics: ['screenPageViews'],
      range,
      inList: { field: 'pagePath', values: [THANK_YOU.sample, THANK_YOU.contact] },
    });
    const out: Thanks = { sample: 0, contact: 0, byChannel: {} };
    for (const r of rows) {
      const ch = String(r.sessionDefaultChannelGroup);
      const kind = r.pagePath === THANK_YOU.sample ? 'sample' : 'contact';
      const n = Number(r.screenPageViews);
      out[kind] += n;
      (out.byChannel[ch] ??= { sample: 0, contact: 0 })[kind] += n;
    }
    return out;
  });
}

// ---- Demo data (local testing only; used when DEMO_DATA is set) ----
function demoReport(q: Query): Row[] {
  const rnd = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return (h % 1000) / 1000; };
  const days = daysBetween(q.range.from, q.range.to);
  const dims = q.dimensions ?? [];
  if (dims.length === 0) return [{ sessions: days * 118, totalUsers: days * 96 }];
  if (dims[0] === 'date')
    return Array.from({ length: days }, (_, i) => {
      const d = shiftDay(q.range.from, i);
      return { date: d.replace(/-/g, ''), sessions: Math.round(80 + rnd(d) * 90) };
    });
  const channels = ['Organic Search', 'Direct', 'Paid Social', 'Referral', 'Organic Social'];
  if (dims[0] === 'sessionDefaultChannelGroup' && dims.length === 1)
    return channels.map((c, i) => ({ sessionDefaultChannelGroup: c, sessions: Math.round(days * [46, 30, 22, 12, 8][i]) }));
  if (dims[0] === 'sessionDefaultChannelGroup')
    return channels.flatMap((c, i) => [
      { sessionDefaultChannelGroup: c, pagePath: THANK_YOU.sample, screenPageViews: Math.round(days * [0.9, 0.5, 0.8, 0.1, 0.1][i]) },
      { sessionDefaultChannelGroup: c, pagePath: THANK_YOU.contact, screenPageViews: Math.round(days * [0.5, 0.4, 0.2, 0.1, 0.05][i]) },
    ]);
  const paths = ['/', '/lining-boards', '/acoustic-panels', '/vulcan-cladding', '/shiplap', '/sample-request', '/contact', '/interior', '/exterior', '/about'];
  return paths.map((p, i) => ({ pagePath: p, screenPageViews: Math.round(days * (40 - i * 3.5)), totalUsers: Math.round(days * (30 - i * 2.5)) }));
}
