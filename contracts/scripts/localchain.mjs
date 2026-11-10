// Dev-only: local chain posing as Elysium (chain 99901) with WETH, Uniswap V2 and MochePad deployed.
// Usage: node scripts/localchain.mjs  → prints {"pad": "...", ...} and keeps serving on :8545.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ganache from 'ganache';
import { createPublicClient, createWalletClient, http } from 'viem';

const require = createRequire(import.meta.url);
const art = JSON.parse(fs.readFileSync(new URL('../out/MochePad.json', import.meta.url)));
const V2F = require('@uniswap/v2-core/build/UniswapV2Factory.json');
const WETH = require('@uniswap/v2-periphery/build/WETH9.json');

const server = ganache.server({ logging: { quiet: true }, wallet: { totalAccounts: 4, defaultBalance: 100000, deterministic: true }, chain: { chainId: 99901, hardfork: 'merge' }, miner: { blockGasLimit: 60_000_000 } });
await new Promise((ok) => server.listen(8545, '127.0.0.1', ok));
const chain = { id: 99901, name: 'local-elysium', nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 }, rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } } };
const pub = createPublicClient({ chain, transport: http('http://127.0.0.1:8545') });
const [owner] = await pub.request({ method: 'eth_accounts' });
const w = createWalletClient({ chain, account: owner, transport: http('http://127.0.0.1:8545') });
const deploy = async (abi, bytecode, args) => (await pub.waitForTransactionReceipt({ hash: await w.deployContract({ abi, bytecode: bytecode.startsWith('0x') ? bytecode : '0x' + bytecode, args, gas: 30_000_000n }) })).contractAddress;
const weth = await deploy(WETH.abi, WETH.bytecode, []);
const factory = await deploy(V2F.abi, V2F.bytecode, [owner]);
const S = 10n ** 27n, usd = 30, r2 = 35000 / 4000, r = Math.sqrt(r2);
const vT = (S * BigInt(Math.round((r2 / (r2 - 1)) * 1e12))) / 10n ** 12n;
const cs = (vT * BigInt(Math.round(((r - 1) / r) * 1e12))) / 10n ** 12n;
const vN = (vT * BigInt(Math.round((4000 / usd) * 1e9))) / (10n ** 18n);
const pad = await deploy(art.MochePad.abi, art.MochePad.bytecode, [factory, weth, owner, vN, vT, cs]);
console.log(JSON.stringify({ pad, weth, factory, owner }));
