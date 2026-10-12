import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// BASE_PATH must match the mount path set for this app in Webflow Cloud.
const base = process.env.BASE_PATH || '/dashboard';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  base,
  build: { assetsPrefix: base },
  security: { checkOrigin: true },
});
