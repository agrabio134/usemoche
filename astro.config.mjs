// @ts-check
import { defineConfig } from 'astro/config';

// `site` is intentionally unset: add your production domain once it is confirmed,
// e.g. site: 'https://<your-domain>'.
export default defineConfig({
  site: 'https://usemoche.vercel.app',
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'auto' },
  devToolbar: { enabled: false },
});
