// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// Pages are prerendered (static). Only the launchpad API routes under
// src/pages/api/ opt out with `export const prerender = false` and run as
// Vercel functions.
export default defineConfig({
  site: 'https://usemoche.vercel.app',
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'auto' },
  devToolbar: { enabled: false },
  integrations: [react()],
  adapter: vercel({ maxDuration: 60 }),
  vite: {
    plugins: [
      nodePolyfills({
        include: ['buffer', 'process', 'util', 'stream', 'events'],
        globals: { Buffer: true, global: true, process: true },
      }),
    ],
  },
});
