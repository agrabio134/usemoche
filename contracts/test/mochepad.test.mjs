import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ganache from 'ganache';
import { createPublicClient, createWalletClient, custom, parseEther, formatEther, getContract, decodeEventLog } from 'viem';

const require = createRequire(import.meta.url);
const art = JSON.parse(fs.readFileSync(new URL('../out/MochePad.json', import.meta.url)));
const V2F = require('@uniswap/v2-core/build/UniswapV2Factory.json');
const V2P = require('@uniswap/v2-core/build/UniswapV2Pair.json');
const WETH = require('@uniswap/v2-periphery/build/WETH9.json');

const S = 10n ** 27n; // 1B * 1e18

// Same formula the deploy page uses: $4k opening cap, $35k graduation cap.
function params(nativeUsd, mc0 = 4000, mcg = 35000) {
  const r2 = mcg / mc0, r = Math.sqrt(r2);
  const vT = (S * BigInt(Math.round((r2 / (r2 - 1)) * 1e12))) / 10n ** 12n;
  const cs = (vT * BigInt(Math.round(((r - 1) / r) * 1e12))) / 10n ** 12n;
  // price per token (native) = mc0 / (1e9 * usd); vN(wei) = price * vT(wei)
  const vN = (vT * BigInt(Math.round((mc0 / nativeUsd) * 1e6))) / (10n ** 9n * 10n ** 6n);
  return { vN, vT, cs };
}

async function setup() {
  const provider = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 6, defaultBalance: 1_000_000 }, chain: { hardfork: 'merge', chainId: 1337 }, miner: { blockGasLimit: 60_000_000 } });
  const chain = { id: 1337, name: 'local', nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 }, rpcUrls: { default: { http: ['http://x'] } } };
  const pub = createPublicClient({ chain, transport: custom(provider) });
  const accounts = await provider.request({ method: 'eth_accounts' });
  const wallet = (i) => createWalletClient({ chain, account: accounts[i], transport: custom(provider) });
  const deploy = async (abi, bytecode, args, i = 0) => {
    const hash = await wallet(i).deployContract({ abi, bytecode: bytecode.startsWith('0x') ? bytecode : '0x' + bytecode, args, gas: 30_000_000n });
    const r = await pub.waitForTransactionReceipt({ hash });
    assert.equal(r.status, 'success');
    return r.contractAddress;
  };
  const weth = await deploy(WETH.abi, WETH.bytecode, []);
  const factory = await deploy(V2F.abi, V2F.bytecode, [accounts[0]]);
  return { provider, pub, accounts, wallet, deploy, weth, factory };
}

async function send(env, i, address, abi, functionName, args = [], value = 0n) {
  const hash = await env.wallet(i).writeContract({ address, abi, functionName, args, value, gas: 15_000_000n });
  const r = await env.pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`${functionName} reverted`);
  return r;
}
const read = (env, address, abi, functionName, args = []) => env.pub.readContract({ address, abi, functionName, args });

test('params seed liquidity at the curve price and contract accepts them', async () => {
  const env = await setup();
  const p = params(30); // HYPE at $30
  const pad = await env.deploy(art.MochePad.abi, art.MochePad.bytecode, [env.factory, env.weth, env.accounts[5], p.vN, p.vT, p.cs]);
  assert.equal(await read(env, pad, art.MochePad.abi, 'curveSupply'), p.cs);
  // bad params: curve supply far too small for the LP allocation -> price gap -> revert
  await assert.rejects(env.deploy(art.MochePad.abi, art.MochePad.bytecode, [env.factory, env.weth, env.accounts[5], p.vN, p.vT, p.cs / 2n]));
});

test('full lifecycle: launch, buy, sell, protection, graduation into Uniswap V2 with burned LP, fees', async () => {
  const env = await setup();
  const A = art.MochePad.abi, T = art.MocheToken.abi;
  const p = params(30);
  const treasury = env.accounts[5];
  const pad = await env.deploy(A, art.MochePad.bytecode, [env.factory, env.weth, treasury, p.vN, p.vT, p.cs]);

  // launch with creator buy of 1 HYPE, 2% fee, protection on
  let r = await send(env, 1, pad, A, 'createToken', ['Moche Test', 'MTEST', 'ipfs://QmTest', 200, true, 0n], parseEther('1'));
  assert.equal(r.status, 'success');
  const created = r.logs.map((l) => { try { return decodeEventLog({ abi: A, ...l }); } catch { return null; } }).find((e) => e?.eventName === 'TokenCreated');
  const token = created.args.token;
  const pair = created.args.pair;
  assert.equal(await read(env, token, T, 'pair'), pair);
  const creatorBal = await read(env, token, T, 'balanceOf', [env.accounts[1]]);
  assert.ok(creatorBal > 0n, 'creator got tokens');

  // protection: fee starts near 10% for others
  const feeNow = await read(env, pad, A, 'currentFeeBps', [token]);
  assert.ok(feeNow > 900n && feeNow <= 1000n, `protected fee ${feeNow}`);
  await env.provider.request({ method: 'evm_increaseTime', params: [150] });
  await env.provider.request({ method: 'evm_mine', params: [] });
  const feeMid = await read(env, pad, A, 'currentFeeBps', [token]);
  assert.ok(feeMid > 500n && feeMid < 700n, `mid fee ${feeMid}`);
  await env.provider.request({ method: 'evm_increaseTime', params: [200] });
  await env.provider.request({ method: 'evm_mine', params: [] });
  assert.equal(await read(env, pad, A, 'currentFeeBps', [token]), 200n);

  // nobody can fund the pair before graduation
  await assert.rejects(send(env, 1, token, T, 'transfer', [pair, 1n]));

  // buyer 2 buys, then sells half; quote matches
  const [qOut] = await read(env, pad, A, 'quoteBuy', [token, parseEther('5')]);
  r = await send(env, 2, pad, A, 'buy', [token, qOut], parseEther('5'));
  assert.equal(r.status, 'success');
  const b2 = await read(env, token, T, 'balanceOf', [env.accounts[2]]);
  assert.equal(b2, qOut);
  const [qSell] = await read(env, pad, A, 'quoteSell', [token, b2 / 2n]);
  const before = await env.pub.getBalance({ address: env.accounts[2] });
  r = await send(env, 2, pad, A, 'sell', [token, b2 / 2n, qSell]);
  assert.equal(r.status, 'success');
  const after = await env.pub.getBalance({ address: env.accounts[2] });
  assert.ok(after > before, 'seller received native');

  // slippage protection
  await assert.rejects(send(env, 3, pad, A, 'buy', [token, 10n ** 30n], parseEther('1')));

  // only creator can claim creator fees
  await assert.rejects(send(env, 2, pad, A, 'claimCreatorFees', [token]));

  // whale buys out the curve -> graduation + refund of excess
  const whaleBefore = await env.pub.getBalance({ address: env.accounts[3] });
  r = await send(env, 3, pad, A, 'buy', [token, 0n], parseEther('5000'));
  assert.equal(r.status, 'success');
  const whaleAfter = await env.pub.getBalance({ address: env.accounts[3] });
  const spent = whaleBefore - whaleAfter;
  assert.ok(spent < parseEther('1000'), `excess refunded, spent ${formatEther(spent)}`);
  const grad = r.logs.map((l) => { try { return decodeEventLog({ abi: A, ...l }); } catch { return null; } }).find((e) => e?.eventName === 'Graduated');
  assert.ok(grad, 'graduated event');
  const info = await read(env, pad, A, 'getToken', [token]);
  assert.equal(info.curve.graduated, true);
  assert.equal(await read(env, token, T, 'graduated'), true);

  // LP burned to dead address; pair price ≈ final curve price
  const lpDead = await read(env, pair, V2P.abi, 'balanceOf', ['0x000000000000000000000000000000000000dEaD']);
  assert.ok(lpDead > 0n);
  const [r0, r1] = await read(env, pair, V2P.abi, 'getReserves');
  const t0 = await read(env, pair, V2P.abi, 'token0');
  const [rT, rN] = t0.toLowerCase() === token.toLowerCase() ? [r0, r1] : [r1, r0];
  const pairPrice = Number(rN) / Number(rT);
  const curvePrice = Number(info.curve.vNative) / Number(info.curve.vToken);
  assert.ok(Math.abs(pairPrice / curvePrice - 1) < 0.02, `pair ${pairPrice} vs curve ${curvePrice}`);
  const usdCap = pairPrice * 1e9 * 30;
  assert.ok(usdCap > 33000 && usdCap < 37000, `graduation cap $${usdCap.toFixed(0)}`);

  // after graduation: curve trading closed, tokens freely transferable (incl. to pair)
  await assert.rejects(send(env, 2, pad, A, 'buy', [token, 0n], parseEther('1')));
  await assert.rejects(send(env, 2, pad, A, 'sell', [token, 1n, 0n]));
  r = await send(env, 2, token, T, 'transfer', [env.accounts[4], 1n]);
  assert.equal(r.status, 'success');

  // pad holds exactly the fees: creator + platform
  const cf = (await read(env, pad, A, 'getToken', [token])).curve.creatorFees;
  const pf = await read(env, pad, A, 'platformFees');
  assert.equal(await env.pub.getBalance({ address: pad }), cf + pf);
  assert.ok(cf > 0n && pf > 0n);
  // pad holds no leftover tokens
  assert.equal(await read(env, token, T, 'balanceOf', [pad]), 0n);

  r = await send(env, 1, pad, A, 'claimCreatorFees', [token]);
  assert.equal(r.status, 'success');
  const tBefore = await env.pub.getBalance({ address: treasury });
  r = await send(env, 4, pad, A, 'claimPlatformFees'); // anyone can trigger; funds go to treasury
  assert.equal(r.status, 'success');
  assert.equal((await env.pub.getBalance({ address: treasury })) - tBefore, pf);
  assert.equal(await env.pub.getBalance({ address: pad }), 0n);
});

test('pre-funded pair (WETH donation + sync) cannot block graduation', async () => {
  const env = await setup();
  const A = art.MochePad.abi;
  const p = params(30);
  const pad = await env.deploy(A, art.MochePad.bytecode, [env.factory, env.weth, env.accounts[5], p.vN, p.vT, p.cs]);
  let r = await send(env, 1, pad, A, 'createToken', ['Grief', 'GRF', '', 100, false, 0n], 0n);
  const created = r.logs.map((l) => { try { return decodeEventLog({ abi: A, ...l }); } catch { return null; } }).find((e) => e?.eventName === 'TokenCreated');
  const { token, pair } = created.args;
  // attacker donates WETH to the pair and syncs
  await send(env, 2, env.weth, WETH.abi, 'deposit', [], parseEther('3'));
  await send(env, 2, env.weth, WETH.abi, 'transfer', [pair, parseEther('3')]);
  await send(env, 2, pair, V2P.abi, 'sync');
  r = await send(env, 3, pad, A, 'buy', [token, 0n], parseEther('5000'));
  assert.equal(r.status, 'success');
  assert.equal((await read(env, pad, A, 'getToken', [token])).curve.graduated, true);
});

test('owner controls: pause, params, treasury; non-owner rejected', async () => {
  const env = await setup();
  const A = art.MochePad.abi;
  const p = params(30);
  const pad = await env.deploy(A, art.MochePad.bytecode, [env.factory, env.weth, env.accounts[5], p.vN, p.vT, p.cs]);
  await assert.rejects(send(env, 1, pad, A, 'setLaunchesPaused', [true]));
  await assert.rejects(send(env, 1, pad, A, 'setTreasury', [env.accounts[1]]));
  assert.equal((await send(env, 0, pad, A, 'setLaunchesPaused', [true])).status, 'success');
  await assert.rejects(send(env, 1, pad, A, 'createToken', ['X', 'XX', '', 100, false, 0n]));
  await send(env, 0, pad, A, 'setLaunchesPaused', [false]);
  await assert.rejects(send(env, 1, pad, A, 'createToken', ['X', 'XX', '', 50, false, 0n]), 'fee below 1%');
  await assert.rejects(send(env, 1, pad, A, 'createToken', ['X', 'XX', '', 400, false, 0n]), 'fee above 3%');
  const p2 = params(40);
  assert.equal((await send(env, 0, pad, A, 'setParams', [p2.vN, p2.vT, p2.cs])).status, 'success');
  // many launches: address prediction keeps working past nonce 127 boundary is costly to test; check several
  for (let i = 0; i < 5; i++) assert.equal((await send(env, 1, pad, A, 'createToken', [`T${i}`, `TK${i}`, '', 150, false, 0n])).status, 'success');
  const list = await read(env, pad, A, 'getTokens', [0n, 10n]);
  assert.equal(list.length, 5);
  assert.equal(list[0].symbol, 'TK4');
});
