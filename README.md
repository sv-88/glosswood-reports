# Glosswood form submissions report

A password-protected report page for glosswood.com.au, built with Astro and run on Webflow Cloud.
It reads form submissions live from the Webflow API, adds older contact enquiries from a bundled
export, and shows them for any date range with a comparison to the previous period.

## Deploy on Webflow Cloud
1. Put this folder in a GitHub repo.
2. In Webflow: Site settings > Webflow Cloud > create a project from the repo, with an environment
   mounted at `/dashboard` (must match `BASE_PATH`, default `/dashboard`).
3. In the environment's settings add these variables:
   - `WEBFLOW_API_TOKEN`  Webflow site token with Forms (read) access
   - `WEBFLOW_SITE_ID`    685e118c736a83a0d84f8170
   - `REPORT_PASSWORD`    the shared password the client types
   - `SESSION_SECRET`     any long random string (e.g. `openssl rand -hex 32`)
4. Deploy. The report is then at https://glosswood.com.au/dashboard.

## Local test
`npm install`, then `DEMO_DATA=1 REPORT_PASSWORD=x SESSION_SECRET=y npm run dev` and open /dashboard.
`npm test` checks the totals against the October 2026 report (270 submissions).

## Updating the contact-form backfill
Webflow's API only holds some older contact enquiries. `src/lib/contact-backfill.json` holds the
timestamp and state of every contact enquiry from a manual export (no names, emails or messages).
Export entries are only added when the API has no entry at the same second, so re-exporting is safe.

## Not built yet
Website traffic (GA4): needs the GA4 property ID and a read-only service account.
