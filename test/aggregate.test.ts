import assert from 'node:assert/strict';
import { fromLive, mergeBackfill, summarise, previousRange } from '../src/lib/aggregate.ts';
import demo from '../fixtures/demo.json' with { type: 'json' };

const live = (demo as any[]).map(fromLive).filter(Boolean) as any[];
const r = { from: '2026-07-01', to: '2026-10-12' };
const s = summarise(live, r);
assert.equal(s.sample, 146, 'sample requests');
// with the API-only contact data (33), then add backfill
const contactLive = live.filter((x) => x.form === 'Contact').length;
assert.equal(contactLive, 33);
const backfill = (await import('../src/lib/contact-backfill.json', { with: { type: 'json' } })).default as any[];
const merged = mergeBackfill(live, backfill);
const m = summarise(merged, r);
assert.equal(m.contact, 124, 'contact enquiries incl. backfill');
assert.equal(m.total, 270);
assert.deepEqual(previousRange({ from: '2026-10-01', to: '2026-10-12' }), { from: '2026-09-19', to: '2026-09-30' });
const months = Object.fromEntries(m.buckets.map((b) => [b.key, b.sample + b.contact]));
assert.deepEqual(months, { '2026-07': 83, '2026-08': 93, '2026-09': 72, '2026-10': 22 });
console.log('all checks passed', m.states.slice(0, 3));
