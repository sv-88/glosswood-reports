import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { signJwt, parseReport, parseServiceAccount, getTraffic, getThankYou } from '../src/lib/ga4';
import { enquiryTakeaway, enquiryRate } from '../src/lib/takeaway';
import { loadEnquiry } from '../src/lib/reports';

// 1. JWT is signed with RS256 and verifies against the matching public key
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const sa = parseServiceAccount(JSON.stringify({ client_email: 'x@y.iam.gserviceaccount.com', private_key: pem.replace(/\n/g, '\\n') }));
const jwt = await signJwt(sa, 1000);
const [h, c, s] = jwt.split('.');
const v = createVerify('RSA-SHA256').update(`${h}.${c}`);
assert.ok(v.verify(publicKey, Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')), 'signature verifies');
const claim = JSON.parse(Buffer.from(c, 'base64url').toString());
assert.equal(claim.iss, 'x@y.iam.gserviceaccount.com');
assert.equal(claim.scope, 'https://www.googleapis.com/auth/analytics.readonly');
assert.equal(claim.exp - claim.iat, 3600);

// 2. parseReport
const rows = parseReport({
  dimensionHeaders: [{ name: 'sessionDefaultChannelGroup' }], metricHeaders: [{ name: 'sessions' }],
  rows: [{ dimensionValues: [{ value: 'Direct' }], metricValues: [{ value: '42' }] }],
});
assert.deepEqual(rows, [{ sessionDefaultChannelGroup: 'Direct', sessions: 42 }]);
assert.deepEqual(parseReport({}), []);

// 3. demo traffic + thank-you shapes
const env: any = { DEMO_DATA: '1', WEBFLOW_SITE_ID: 'x' };
const range = { from: '2026-10-01', to: '2026-10-12' };
const t = await getTraffic(env, range);
assert.equal(t.buckets.length, 12);
assert.ok(t.pages.every((p) => !p.path.startsWith('/thank-you')));
const y = await getThankYou(env, range);
assert.equal(y.sample, Object.values(y.byChannel).reduce((a, b) => a + b.sample, 0));

// 4. enquiry report + conversion maths
const e = await loadEnquiry(env, range, true);
assert.ok(e.ok);
if (e.ok) {
  assert.equal(e.data.sessions, t.sessions);
  assert.equal(enquiryRate(5, 100), 0.05);
  assert.equal(enquiryRate(5, 0), 0);
  assert.ok(enquiryTakeaway(e.data).length >= 1);
}
// 5. not configured is non-fatal
const off = await loadEnquiry({ DEMO_DATA: undefined } as any, range, false);
assert.equal(off.ok, false);
console.log('ga4 tests passed');
