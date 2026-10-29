# usemoche website

The usemoche marketing site: Home, Products, Copy Trading, Launchpad and $MOCHE.
Built with [Astro](https://astro.build). Pages are static HTML with small scripts for the interactive parts, so it loads fast and can be hosted anywhere.

## Run it

Requires Node.js 18.20+ (20 or 22 recommended).

```bash
npm install
npm run dev      # local dev server at http://localhost:4321
npm run build    # production build into ./dist
npm run preview  # serve the production build locally
```

After `npm run build`, upload the `dist/` folder to any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3 and so on).
Note: opening `dist/index.html` directly from disk won't work properly, because the pages use root-relative links. Use `npm run preview` or a host.

## Where to change things

| What | File |
| --- | --- |
| Links (X, Docs, Support, Terms, Privacy), contract address, network, supported networks, copy-trading verification/app URLs, product status | `src/config/site.ts` |
| Copy text, product list, illustrative previews, FAQ, disclaimer | `src/content/site-content.ts` |
| Colors, type, spacing, radius, shadows | `src/styles/tokens.css` |
| Shared styles (buttons, badges, cards, notices) | `src/styles/global.css` |
| Pages | `src/pages/*.astro` |
| Components | `src/components/` |
| Mascot images | `public/images/` |

### Unconfirmed details are config, not content

Anything not yet confirmed is `null` or empty in `src/config/site.ts`. The UI handles each case honestly:

- **Links = `null`**: shown as "Soon" labels instead of dead links.
- **`tokenInfo.contractAddress` = `null`**: the $MOCHE page says "Not published here yet". Once you set it, a copy button appears.
- **`supportedNetworks` = `[]`**: the FAQ and Check section say "To be confirmed".
- **`copyTradingAccess.verificationUrl` = `null`**: the holder section shows "Preview: verification not connected yet". It never fakes a wallet connection or an eligibility result. Set the URL and a "Check eligibility" button appears.
- **`copyTradingAccess.appUrl` = `null`**: the Copy Trading page links to its interface preview. Set it and the main button opens the app.
- **`productStatus`**: nothing is labelled "Live" yet. Launchpad is "Coming Soon".

Set `site` in `astro.config.mjs` once the production domain is confirmed (this enables absolute URLs for the social share image).

## What's real vs. illustrative

- **Marketing content**: `site-content.ts`.
- **Illustrative demos** (sample signal/check replies, X thread, copy-trading controls, launchpad form): every one is labelled "Illustrative preview" or "Interface preview". None calls an API or saves anything.
- **Backend functionality**: none is wired up yet. Hook points are the URLs in `site.ts`.

## Accessibility & performance

- Keyboard focus rings, skip link, WAI-ARIA tabs (arrow keys), native `<dialog>` sheets (Esc / backdrop to close, focus returns), native `<details>` FAQ.
- `prefers-reduced-motion` respected; no looping animations.
- Self-hosted fonts, WebP mascot in 3 sizes with `srcset`, explicit image dimensions to prevent layout shift, hero image preloaded.
- Mobile: single column, compact header, bottom nav (Home / Tools / Copy / MOCHE) with safe-area padding and page padding so it never covers content.
