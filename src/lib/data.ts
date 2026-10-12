import { fromLive, mergeBackfill, type Sub } from './aggregate';
import backfill from './contact-backfill.json';
import type { Env } from './env';

let cache: { at: number; subs: Sub[] } | null = null;
const TTL = 60_000; // refetch at most once a minute

async function fetchAllLive(env: Env): Promise<any[]> {
  const out: any[] = [];
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(
      `https://api.webflow.com/v2/sites/${env.WEBFLOW_SITE_ID}/form_submissions?limit=100&offset=${offset}`,
      { headers: { Authorization: `Bearer ${env.WEBFLOW_API_TOKEN}`, accept: 'application/json' } },
    );
    if (!res.ok) throw new Error(`Webflow API ${res.status}`);
    const j: any = await res.json();
    const batch = j.formSubmissions ?? [];
    out.push(...batch);
    const total = j.pagination?.total ?? out.length;
    if (!batch.length || out.length >= total) break;
  }
  return out;
}

export async function loadSubmissions(env: Env): Promise<Sub[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.subs;
  let raw: any[];
  if (env.DEMO_DATA) {
    raw = (await import('../../fixtures/demo.json')).default as any[];
  } else {
    if (!env.WEBFLOW_API_TOKEN || !env.WEBFLOW_SITE_ID) throw new Error('Webflow settings missing');
    raw = await fetchAllLive(env);
  }
  const live = raw.map(fromLive).filter((s): s is Sub => !!s);
  const subs = mergeBackfill(live, backfill as { t: string; state: string }[]);
  cache = { at: Date.now(), subs };
  return subs;
}
