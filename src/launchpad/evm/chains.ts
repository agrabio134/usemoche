import type { Address } from 'viem';

export type ChainKey = 'solana' | 'elysium' | 'robinhood';
export type EvmChainKey = Exclude<ChainKey, 'solana'>;

export type EvmChain = {
  key: EvmChainKey;
  id: number;
  name: string;
  tagline: string;
  native: { symbol: string; name: string; decimals: 18 };
  /** Solana mint used to read the native coin's USD price from GeckoTerminal. */
  priceMint: string;
  publicRpc: string;
  explorer: string;
  v2Factory: Address;
  v2Router: Address;
  weth: Address;
  /** MochePad contract; null until the owner deploys it from /launchpad/deploy. */
  pad: Address | null;
  docs: string;
};

const env = (key: string): Address | null => {
  const v = (import.meta as any).env?.[key];
  return typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : null;
};

/*
 * Network parameters: Kinetiq docs (elysium.kinetiq.xyz/docs/connecting-to-elysium), Robinhood Chain docs.
 * Uniswap V2 factory/router addresses: @uniswap/sdk-core 7.22 (V2_FACTORY_ADDRESSES / V2_ROUTER_ADDRESSES).
 * The site reads WETH from the router on-chain before every graduation-related call; values here are for display.
 */
export const EVM_CHAINS: Record<EvmChainKey, EvmChain> = {
  elysium: {
    key: 'elysium',
    id: 99901,
    name: 'Elysium',
    tagline: 'Kinetiq’s HYPE-native chain for Hyperliquid',
    native: { symbol: 'HYPE', name: 'HYPE', decimals: 18 },
    priceMint: '98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g',
    publicRpc: 'https://rpc.elysium.kinetiq.xyz',
    explorer: 'https://elysium.kinetiq.xyz/explorer',
    v2Factory: '0xBbBcC62853a5fA27b93d6Bab3E6F7ce841E25Df2',
    v2Router: '0xE783DE89a7F0408687f051e3E6D0BEb62719EbAd',
    weth: '0xbA876237B0F021A6c6D852d6c26E107997cC5E81',
    pad: env('PUBLIC_MOCHEPAD_ELYSIUM'),
    docs: 'https://elysium.kinetiq.xyz/docs',
  },
  robinhood: {
    key: 'robinhood',
    id: 4663,
    name: 'Robinhood Chain',
    tagline: 'Robinhood’s Ethereum L2 for tokenized assets',
    native: { symbol: 'ETH', name: 'Ether', decimals: 18 },
    priceMint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
    publicRpc: 'https://rpc.mainnet.chain.robinhood.com',
    explorer: 'https://robinhoodchain.blockscout.com',
    v2Factory: '0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f',
    v2Router: '0x89e5db8b5aa49aa85ac63f691524311aeb649eba',
    weth: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
    pad: env('PUBLIC_MOCHEPAD_ROBINHOOD'),
    docs: 'https://docs.robinhood.com/chain',
  },
};

export const CHAIN_TABS: { key: ChainKey; name: string; native: string }[] = [
  { key: 'solana', name: 'Solana', native: 'SOL · HYPE · stocks' },
  { key: 'elysium', name: 'Elysium', native: 'HYPE' },
  { key: 'robinhood', name: 'Robinhood Chain', native: 'ETH' },
];

export const explorerTx = (c: EvmChain, hash: string) => `${c.explorer}/tx/${hash}`;
export const explorerAddress = (c: EvmChain, a: string) => `${c.explorer}/address/${a}`;

export function readChainFromUrl(): ChainKey {
  const v = new URLSearchParams(location.search).get('chain');
  return v === 'elysium' || v === 'robinhood' ? v : 'solana';
}
