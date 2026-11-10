import { createPublicClient, createWalletClient, custom, http, defineChain, getAddress, type Address, type PublicClient, type WalletClient, type EIP1193Provider } from 'viem';
import artifacts from './artifacts.json';
import type { EvmChain } from './chains';

export const PAD_ABI = artifacts.MochePad.abi as any[];
export const TOKEN_ABI = artifacts.MocheToken.abi as any[];
export const PAD_BYTECODE = artifacts.MochePad.bytecode as `0x${string}`;

export const ROUTER_ABI = [
  { type: 'function', name: 'WETH', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'factory', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'getAmountsOut', stateMutability: 'view', inputs: [{ type: 'uint256' }, { type: 'address[]' }], outputs: [{ type: 'uint256[]' }] },
  { type: 'function', name: 'swapExactETHForTokensSupportingFeeOnTransferTokens', stateMutability: 'payable', inputs: [{ type: 'uint256' }, { type: 'address[]' }, { type: 'address' }, { type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'swapExactTokensForETHSupportingFeeOnTransferTokens', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'address[]' }, { type: 'address' }, { type: 'uint256' }], outputs: [] },
] as const;

export const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

export function viemChain(c: EvmChain) {
  return defineChain({
    id: c.id,
    name: c.name,
    nativeCurrency: c.native,
    rpcUrls: { default: { http: [c.publicRpc] } },
    blockExplorers: { default: { name: `${c.name} explorer`, url: c.explorer } },
  });
}

const publicClients = new Map<string, PublicClient>();
/** Reads go through the site's RPC relay (/api/evm-rpc), which forwards to the chain's RPC. */
export function publicClient(c: EvmChain): PublicClient {
  let client = publicClients.get(c.key);
  if (!client) {
    client = createPublicClient({ chain: viemChain(c), transport: http(new URL(`/api/evm-rpc?chain=${c.key}`, location.origin).href, { retryCount: 2, timeout: 20_000 }) }) as PublicClient;
    publicClients.set(c.key, client);
  }
  return client;
}

/* ---------- EIP-6963 wallet discovery ---------- */
export type EvmWallet = { id: string; name: string; icon: string; provider: EIP1193Provider };

export function discoverWallets(onChange: (list: EvmWallet[]) => void) {
  const found = new Map<string, EvmWallet>();
  const emit = () => onChange([...found.values()]);
  const handler = (event: any) => {
    const { info, provider } = event.detail || {};
    if (!info?.uuid || !provider) return;
    found.set(info.uuid, { id: info.uuid, name: info.name, icon: info.icon, provider });
    emit();
  };
  window.addEventListener('eip6963:announceProvider', handler);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  // Legacy injected wallet with no EIP-6963 support.
  const t = window.setTimeout(() => {
    const eth = (window as any).ethereum;
    if (!found.size && eth?.request) { found.set('injected', { id: 'injected', name: eth.isMetaMask ? 'MetaMask' : 'Browser wallet', icon: '', provider: eth }); emit(); }
  }, 400);
  return () => { window.removeEventListener('eip6963:announceProvider', handler); window.clearTimeout(t); };
}

export type EvmSession = { wallet: EvmWallet; address: Address; client: WalletClient };

export async function ensureChain(provider: EIP1193Provider, c: EvmChain) {
  const hex = `0x${c.id.toString(16)}` as const;
  const current = await provider.request({ method: 'eth_chainId' });
  if (String(current).toLowerCase() === hex) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
  } catch (e: any) {
    if (e?.code !== 4902 && !/unrecognized|not added|unknown chain/i.test(String(e?.message))) throw e;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{ chainId: hex, chainName: c.name, nativeCurrency: c.native, rpcUrls: [c.publicRpc], blockExplorerUrls: [c.explorer] }],
    });
  }
}

export async function connectWallet(wallet: EvmWallet, c: EvmChain): Promise<EvmSession> {
  const accounts = (await wallet.provider.request({ method: 'eth_requestAccounts' })) as string[];
  if (!accounts?.length) throw new Error('No account was shared by the wallet.');
  await ensureChain(wallet.provider, c);
  const address = getAddress(accounts[0]);
  const client = createWalletClient({ account: address, chain: viemChain(c), transport: custom(wallet.provider) });
  return { wallet, address, client };
}

/* ---------- MochePad reads ---------- */
export type Curve = {
  creator: Address; feeBps: number; protection: boolean; graduated: boolean; createdAt: number;
  vNative: bigint; vToken: bigint; realNative: bigint; realToken: bigint; creatorFees: bigint; lpTokens: bigint;
};
export type EvmMarket = { token: Address; name: string; symbol: string; metadataURI: string; pair: Address; curve: Curve };

const SUPPLY = 10n ** 27n;
export function marketStats(m: EvmMarket, nativeUsd: number | null) {
  const c = m.curve;
  const curveSupply = SUPPLY - c.lpTokens;
  const sold = curveSupply - c.realToken;
  const progress = c.graduated ? 1 : curveSupply > 0n ? Number((sold * 10_000n) / curveSupply) / 10_000 : 0;
  const priceNative = Number(c.vNative) / Number(c.vToken);
  const capNative = priceNative * 1e9;
  return { progress, priceNative, capNative, capUsd: nativeUsd ? capNative * nativeUsd : null, raised: Number(c.realNative) / 1e18 };
}

export async function listEvmMarkets(c: EvmChain, limit = 60): Promise<EvmMarket[]> {
  if (!c.pad) return [];
  const list = (await publicClient(c).readContract({ address: c.pad, abi: PAD_ABI, functionName: 'getTokens', args: [0n, BigInt(limit)] })) as any[];
  return list.map(normalize);
}

export async function getEvmMarket(c: EvmChain, token: Address): Promise<EvmMarket | null> {
  if (!c.pad) return null;
  const m = (await publicClient(c).readContract({ address: c.pad, abi: PAD_ABI, functionName: 'getToken', args: [token] })) as any;
  const n = normalize(m);
  return n.curve.creator === '0x0000000000000000000000000000000000000000' ? null : n;
}

export async function marketsCreatedBy(c: EvmChain, creator: Address): Promise<EvmMarket[]> {
  if (!c.pad) return [];
  const tokens = (await publicClient(c).readContract({ address: c.pad, abi: PAD_ABI, functionName: 'tokensCreatedBy', args: [creator] })) as Address[];
  const out = await Promise.all(tokens.slice(-60).reverse().map((t) => getEvmMarket(c, t)));
  return out.filter(Boolean) as EvmMarket[];
}

function normalize(m: any): EvmMarket {
  const c = m.curve;
  return {
    token: m.token, name: m.name, symbol: m.symbol, metadataURI: m.metadataURI, pair: m.pair,
    curve: {
      creator: c.creator, feeBps: Number(c.feeBps), protection: c.protection, graduated: c.graduated, createdAt: Number(c.createdAt),
      vNative: c.vNative, vToken: c.vToken, realNative: c.realNative, realToken: c.realToken, creatorFees: c.creatorFees, lpTokens: c.lpTokens,
    },
  };
}

/* ---------- metadata ---------- */
const metaCache = new Map<string, Promise<{ image?: string; description?: string; website?: string } | null>>();
export function ipfsHttp(uri: string) {
  const m = /^ipfs:\/\/(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/.exec(uri);
  if (m) return `https://gateway.pinata.cloud/ipfs/${m[1]}`;
  return /^https:\/\//.test(uri) ? uri : null;
}
export function tokenMetadata(uri: string) {
  if (!metaCache.has(uri)) {
    const url = ipfsHttp(uri);
    metaCache.set(uri, url ? fetch(url, { signal: AbortSignal.timeout(12_000) }).then((r) => (r.ok ? r.json() : null)).then((d) => d && ({
      image: typeof d.image === 'string' && /^https:\/\//.test(d.image) ? d.image.replace('https://ipfs.io/ipfs/', 'https://gateway.pinata.cloud/ipfs/') : undefined,
      description: typeof d.description === 'string' ? d.description.slice(0, 1000) : undefined,
      website: typeof d.external_url === 'string' && /^https:\/\//.test(d.external_url) ? d.external_url : undefined,
    })).catch(() => null) : Promise.resolve(null));
  }
  return metaCache.get(uri)!;
}

export function evmMessage(e: unknown) {
  const err = e as any;
  console.warn('[mochepad]', e);
  const text = String(err?.shortMessage || err?.details || err?.message || '');
  if (!text) return 'Something went wrong. Please try again.';
  if (/user rejected|denied|rejected the request|4001/i.test(text) || err?.code === 4001) return 'You declined the request in your wallet. Nothing was sent.';
  if (/insufficient funds/i.test(text)) return 'This wallet doesn’t have enough balance for the amount plus network fees.';
  if (/Slippage/i.test(text)) return 'The price moved past your slippage limit. Nothing was spent; try again.';
  if (/AlreadyGraduated/i.test(text)) return 'This token has graduated. It now trades on Uniswap.';
  if (/Paused/i.test(text)) return 'New launches are paused right now.';
  if (/Failed to fetch|HTTP request failed|took too long|timed out|503|429|RPC unavailable/i.test(text)) return 'Can’t reach the network right now. Please retry in a moment.';
  return text.length > 220 ? text.slice(0, 217) + '…' : text;
}

export const shortEvm = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Sends a contract write with a gas limit estimated by the site (+25%), so wallets never fall back to a default. */
export async function write(c: EvmChain, s: EvmSession, req: { address: Address; abi: any; functionName: string; args?: readonly unknown[]; value?: bigint }) {
  const pc = publicClient(c);
  const gas = await pc.estimateContractGas({ ...req, account: s.address } as any);
  return s.client.writeContract({ ...req, gas: (gas * 125n) / 100n, account: s.address, chain: undefined } as any) as Promise<`0x${string}`>;
}
export async function deployPad(c: EvmChain, s: EvmSession, args: readonly unknown[]) {
  const pc = publicClient(c);
  const { encodeDeployData } = await import('viem');
  const data = encodeDeployData({ abi: PAD_ABI, bytecode: PAD_BYTECODE, args: args as any });
  const gas = await pc.estimateGas({ account: s.address, data });
  return s.client.sendTransaction({ data, gas: (gas * 125n) / 100n, account: s.address, chain: undefined } as any) as Promise<`0x${string}`>;
}
