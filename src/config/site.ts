/**
 * usemoche — site & integration configuration
 * ------------------------------------------------------------
 * Everything that is NOT confirmed yet lives here so it can be
 * changed in one place. A value of `null` means "not available":
 * the UI will hide the action or explain its status instead of
 * rendering a dead link or a fake result.
 *
 * Do not put invented URLs, contract addresses or dates in here.
 */

export type MaybeUrl = string | null;

export const brand = {
  name: 'usemoche',
  mascot: 'Moche',
  token: '$MOCHE',
  tokenPlain: 'MOCHE',
  totalSupply: 1_000_000_000,
  xHandle: '@usemoche',
  commands: {
    signal: '@usemoche signal',
    check: '@usemoche check',
  },
} as const;

/** Copy trading holder requirement (a holding requirement — not a price, not staking). */
export const copyTradingAccess = {
  minimumHolding: 10_000_000,
  /**
   * URL of the real eligibility / wallet verification flow.
   * While `null`, the site shows an honest "not connected yet" notice
   * and never simulates a wallet connection or an eligibility result.
   */
  verificationUrl: null as MaybeUrl,
  /** URL of the live copy trading app, once available. */
  appUrl: null as MaybeUrl,
};

/** Public links. `null` = not published yet (rendered as "Soon", not as a link). */
export const links: Record<'x' | 'docs' | 'support' | 'terms' | 'privacy', MaybeUrl> = {
  x: 'https://x.com/usemoche',
  docs: null,
  support: null,
  terms: null,
  privacy: null,
};

/** Token facts that are not confirmed yet. */
export const tokenInfo = {
  /** Official contract address. Keep `null` until it is published by the team. */
  contractAddress: '2C5DqjLHvJbxdf5c2o99KB8PScyt3XUtykmXHYuGmeme' as string | null,
  /** Network the token lives on. `null` = not announced on this site yet. */
  network: null as string | null,
};

/**
 * Networks supported by Signal / Check / Copy Trading.
 * Empty array = not confirmed; the UI says so instead of guessing.
 */
export const supportedNetworks: string[] = [];

/** Product availability. Only set `live` when the status is confirmed. */
export type ProductStatus = 'live' | 'coming-soon' | 'unconfirmed';
export const productStatus: Record<'signal' | 'check' | 'copy' | 'launchpad', ProductStatus> = {
  signal: 'unconfirmed',
  check: 'unconfirmed',
  copy: 'unconfirmed',
  launchpad: 'coming-soon',
};

export const formatNumber = (n: number) => n.toLocaleString('en-US');
