// Reads settings from Webflow Cloud (Cloudflare) bindings, falling back to process env for local dev.
export type Env = {
  WEBFLOW_API_TOKEN?: string;
  WEBFLOW_SITE_ID?: string;
  REPORT_PASSWORD?: string;
  SESSION_SECRET?: string;
  DEMO_DATA?: string;
};

export function getEnv(locals: unknown): Env {
  const rt = (locals as any)?.runtime?.env ?? {};
  const pe = typeof process !== 'undefined' ? process.env : {};
  const ie = (import.meta as any).env ?? {};
  const pick = (k: keyof Env) => rt[k] ?? pe[k] ?? ie[k];
  return {
    WEBFLOW_API_TOKEN: pick('WEBFLOW_API_TOKEN'),
    WEBFLOW_SITE_ID: pick('WEBFLOW_SITE_ID'),
    REPORT_PASSWORD: pick('REPORT_PASSWORD'),
    SESSION_SECRET: pick('SESSION_SECRET'),
    DEMO_DATA: pick('DEMO_DATA'),
  };
}
