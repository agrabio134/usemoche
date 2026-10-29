/**
 * Launchpad constants.
 * PLATFORM_WALLET receives the platform share of trading fees (same wallet as FirePad, by request).
 * Pools are discovered on-chain by this fee-claimer address.
 */
export const PLATFORM_WALLET = 'C1rdVXhfUe3RDNxMFrGYSHN6MpkhjTLhVaBk3ZpMJWnT';
export const DBC_PROGRAM = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
export const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export const SOL = 'So11111111111111111111111111111111111111112';
export const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
/** HYPE (Hyperliquid) bridged to Solana via Wormhole — listed on tokens.solana.com/hyperliquid. Verified on-chain before use. */
export const HYPE = '98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g';

export type Asset = {
  mint: string;
  symbol: string;
  name: string;
  category: 'crypto' | 'stock';
  logo?: string;
  halted?: boolean;
  featured?: 'hyperliquid';
};

export const CORE_ASSETS: Asset[] = [
  { mint: HYPE, symbol: 'HYPE', name: 'Hyperliquid (Wormhole)', category: 'crypto', featured: 'hyperliquid' },
  { mint: SOL, symbol: 'SOL', name: 'Solana', category: 'crypto' },
  { mint: USDC, symbol: 'USDC', name: 'USD Coin', category: 'crypto' },
];

/** Marker written into token metadata so usemoche launches can be recognised. */
export const LAUNCHPAD_TAG = 'usemoche';
