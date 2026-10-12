import { defineMiddleware } from 'astro:middleware';
import { getEnv } from './lib/env';
import { COOKIE, safeEqual, token } from './lib/auth';

export const onRequest = defineMiddleware(async (ctx, next) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const path = ctx.url.pathname;
  // Never let search engines or caches keep the report.
  const finish = async () => {
    const res = await next();
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    res.headers.set('Cache-Control', 'private, no-store');
    return res;
  };
  if (path === base + '/login' || path.startsWith(base + '/_astro')) return finish();

  const env = getEnv(ctx.locals);
  if (!env.REPORT_PASSWORD || !env.SESSION_SECRET) return new Response('Report is not configured.', { status: 500 });
  const expected = await token(env.REPORT_PASSWORD, env.SESSION_SECRET);
  const got = ctx.cookies.get(COOKIE)?.value ?? '';
  if (!safeEqual(got, expected)) return ctx.redirect(base + '/login');
  return finish();
});
