import { Buffer } from 'buffer';
(globalThis as any).Buffer ??= Buffer;
import { useEffect, useState } from 'react';
import { formatEther, isAddress, getAddress, type Address } from 'viem';
import { Wallet, Rocket, Check, CircleAlert, ArrowRight, ExternalLink, RefreshCw } from 'lucide-react';
import '../launchpad.css';
import '../multichain.css';
import { EVM_CHAINS, explorerAddress, explorerTx, type EvmChainKey } from './chains';
import { curveParams, OPENING_CAP_USD, GRADUATION_CAP_USD } from './params';
import { PAD_ABI, ROUTER_ABI, publicClient, write, deployPad, discoverWallets, connectWallet, ensureChain, evmMessage, shortEvm, type EvmWallet, type EvmSession } from './client';
import { Notice, Field } from '../app/ui';

type Check = { label: string; ok: boolean | null; detail?: string };

export default function Deploy() {
  const [key, setKey] = useState<EvmChainKey>('elysium');
  const chain = EVM_CHAINS[key];
  const [wallets, setWallets] = useState<EvmWallet[]>([]);
  const [session, setSession] = useState<EvmSession | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [weth, setWeth] = useState<Address | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [treasury, setTreasury] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [deployed, setDeployed] = useState<{ address: Address; tx: string } | null>(null);
  const [admin, setAdmin] = useState<{ owner: Address; treasury: Address; paused: boolean; vN: bigint; platformFees: bigint } | null>(null);
  const [lastTx, setLastTx] = useState('');

  useEffect(() => discoverWallets(setWallets), []);
  useEffect(() => { setSession(null); setDeployed(null); setError(''); setStatus(''); }, [key]);
  useEffect(() => { if (session && !treasury) setTreasury(session.address); }, [session?.address]);

  useEffect(() => {
    let active = true; setPrice(null);
    fetch(`/api/market-data?mode=price&mint=${chain.priceMint}`).then((r) => r.json()).then((d) => { if (active && Number.isFinite(d.usd)) setPrice(d.usd); }).catch(() => {});
    return () => { active = false; };
  }, [key]);

  async function verify() {
    const pc = publicClient(chain);
    const list: Check[] = [];
    try { const id = await pc.getChainId(); list.push({ label: `RPC is ${chain.name} (chain ${chain.id})`, ok: id === chain.id, detail: `got ${id}` }); }
    catch { list.push({ label: `RPC reachable`, ok: false }); setChecks(list); return; }
    const [routerCode, factoryCode] = await Promise.all([pc.getCode({ address: chain.v2Router }), pc.getCode({ address: chain.v2Factory })]);
    list.push({ label: 'Uniswap V2 router deployed', ok: !!routerCode && routerCode !== '0x', detail: shortEvm(chain.v2Router) });
    list.push({ label: 'Uniswap V2 factory deployed', ok: !!factoryCode && factoryCode !== '0x', detail: shortEvm(chain.v2Factory) });
    try {
      const [w, f] = await Promise.all([
        pc.readContract({ address: chain.v2Router, abi: ROUTER_ABI, functionName: 'WETH' }) as Promise<Address>,
        pc.readContract({ address: chain.v2Router, abi: ROUTER_ABI, functionName: 'factory' }) as Promise<Address>,
      ]);
      list.push({ label: 'Router points to that factory', ok: f.toLowerCase() === chain.v2Factory.toLowerCase(), detail: shortEvm(f) });
      const wc = await pc.getCode({ address: w });
      list.push({ label: `Wrapped ${chain.native.symbol} from router`, ok: !!wc && wc !== '0x', detail: shortEvm(w) });
      setWeth(w);
    } catch { list.push({ label: 'Router answers WETH() and factory()', ok: false }); }
    setChecks(list);
  }
  async function loadAdmin() {
    if (!chain.pad) { setAdmin(null); return; }
    const pc = publicClient(chain);
    try {
      const [owner, t, paused, vN, platformFees] = (await Promise.all(['owner', 'treasury', 'launchesPaused', 'virtualNative', 'platformFees'].map((f) => pc.readContract({ address: chain.pad!, abi: PAD_ABI, functionName: f })))) as any[];
      setAdmin({ owner, treasury: t, paused, vN, platformFees });
    } catch (e) { setError(evmMessage(e)); }
  }
  useEffect(() => { setChecks([]); setWeth(null); verify(); loadAdmin(); }, [key]);

  const params = price ? curveParams(price) : null;
  const allOk = checks.length > 0 && checks.every((c) => c.ok);
  const currentOpening = admin && price ? (Number(admin.vN) / 1e18) * price / 1.129032 : null;

  async function act(label: string, fn: () => Promise<`0x${string}`>) {
    if (!session) return;
    setBusy(true); setError(''); setStatus(label); setLastTx('');
    try {
      await ensureChain(session.wallet.provider, chain);
      const hash = await fn(); setLastTx(hash); setStatus('Waiting for confirmation…');
      const r = await publicClient(chain).waitForTransactionReceipt({ hash, timeout: 180_000 });
      if (r.status !== 'success') throw new Error('The transaction reverted.');
      setStatus('Confirmed.');
      return r;
    } catch (e) { setError(evmMessage(e)); setStatus(''); }
    finally { setBusy(false); }
  }

  async function deploy() {
    if (!session || !params || !weth) return;
    if (!isAddress(treasury)) return setError('Enter a valid treasury address.');
    const r = await act('Confirm the deployment in your wallet…', () => deployPad(chain, session, [chain.v2Factory, weth, getAddress(treasury), params.virtualNative, params.virtualToken, params.curveSupply]));
    if (r?.contractAddress) setDeployed({ address: r.contractAddress, tx: r.transactionHash });
  }

  const isOwner = !!session && !!admin && admin.owner.toLowerCase() === session.address.toLowerCase();

  return (
    <div className="lpx">
      <div className="lp-main lp-deploy">
        <section className="lp-title">
          <span className="lp-eyebrow">Owner console · unlisted</span>
          <h1>Deploy MochePad contracts.</h1>
          <p>Deploys the launchpad contract from your own wallet. Your wallet becomes the owner. usemoche never sees a private key.</p>
        </section>
        <div className="lp-seg" role="group" aria-label="Chain">
          {(Object.keys(EVM_CHAINS) as EvmChainKey[]).map((k) => <button key={k} aria-pressed={key === k} onClick={() => setKey(k)}>{EVM_CHAINS[k].name}</button>)}
        </div>

        {error && <div className="lp-alert" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}
        {status && <div className="lp-status" role="status">{busy ? <span className="lp-spinner" /> : <Check size={18} />} <span>{status}</span>{lastTx && <a href={explorerTx(chain, lastTx)} target="_blank" rel="noreferrer">View transaction <ExternalLink size={14} /></a>}</div>}

        <section className="lp-panel">
          <div className="lp-head lp-head--tight"><h2 className="lp-h2" style={{ margin: 0 }}>1. Network checks</h2><button className="lp-btn lp-btn--ghost lp-btn--sm" onClick={verify}><RefreshCw size={14} /> Re-check</button></div>
          <dl className="lp-dl">
            {checks.length ? checks.map((c) => <div key={c.label}><dt>{c.label}</dt><dd>{c.ok ? <span className="lp-ok"><Check size={14} /> {c.detail || 'OK'}</span> : <span className="lp-over">Failed {c.detail ? `· ${c.detail}` : ''}</span>}</dd></div>)
              : <div><dt>Checking {chain.name}…</dt><dd><span className="lp-spinner" /></dd></div>}
          </dl>
        </section>

        <section className="lp-panel">
          <h2 className="lp-h2">2. Curve parameters</h2>
          <p className="lp-muted">Computed from the live {chain.native.symbol} price so launches open at ${OPENING_CAP_USD.toLocaleString()} and graduate at ${GRADUATION_CAP_USD.toLocaleString()}. Re-price later from this page if {chain.native.symbol} moves a lot; existing launches keep their curve.</p>
          {params ? (
            <dl className="lp-dl">
              <div><dt>{chain.native.symbol} price</dt><dd>${price!.toLocaleString('en-US', { maximumFractionDigits: 2 })}</dd></div>
              <div><dt>Virtual {chain.native.symbol}</dt><dd>{Number(formatEther(params.virtualNative)).toFixed(4)}</dd></div>
              <div><dt>Tokens sold on curve</dt><dd>{(Number(params.curveSupply) / 1e24).toFixed(1)}M</dd></div>
              <div><dt>Raised at graduation</dt><dd>{params.raisedNative.toFixed(3)} {chain.native.symbol} (≈ ${Math.round(params.raisedUsd).toLocaleString()})</dd></div>
            </dl>
          ) : <Notice tone="warn">Waiting for a live {chain.native.symbol} price…</Notice>}
        </section>

        {!chain.pad && !deployed && (
          <section className="lp-panel">
            <h2 className="lp-h2">3. Deploy</h2>
            {!session ? (
              wallets.length ? <div className="lp-row">{wallets.map((w) => <button key={w.id} className="lp-btn lp-btn--secondary" onClick={async () => { try { setSession(await connectWallet(w, chain)); } catch (e) { setError(evmMessage(e)); } }}><Wallet size={15} /> {w.name}</button>)}</div>
                : <Notice>No EVM wallet detected in this browser.</Notice>
            ) : (
              <>
                <p className="lp-muted">Owner: {session.address}</p>
                <Field label="Treasury (receives the 50% platform fee share)"><input value={treasury} onChange={(e) => setTreasury(e.target.value.trim())} spellCheck={false} /></Field>
                <Notice tone="warn">These contracts are unaudited. Deploying costs gas in {chain.native.symbol}. The owner can pause new launches, change the treasury and re-price future launches; the owner cannot move anyone’s funds.</Notice>
                <button className="lp-btn lp-btn--primary" disabled={busy || !allOk || !params || !weth} onClick={deploy}><Rocket size={16} /> Deploy on {chain.name}</button>
              </>
            )}
          </section>
        )}

        {deployed && (
          <section className="lp-panel">
            <h2 className="lp-h2"><Check size={18} /> Deployed</h2>
            <dl className="lp-dl">
              <div><dt>MochePad on {chain.name}</dt><dd><a className="lp-addr" href={explorerAddress(chain, deployed.address)} target="_blank" rel="noreferrer">{deployed.address} <ExternalLink size={12} /></a></dd></div>
            </dl>
            <p>Last step: switch it on for the site. Send this address back in the chat, or add it in Vercel as an environment variable and redeploy:</p>
            <pre>{`PUBLIC_MOCHEPAD_${key.toUpperCase()}=${deployed.address}`}</pre>
          </section>
        )}

        {chain.pad && admin && (
          <section className="lp-panel">
            <h2 className="lp-h2">Owner controls</h2>
            <dl className="lp-dl">
              <div><dt>Contract</dt><dd><a className="lp-addr" href={explorerAddress(chain, chain.pad)} target="_blank" rel="noreferrer">{shortEvm(chain.pad)} <ExternalLink size={12} /></a></dd></div>
              <div><dt>Owner</dt><dd>{shortEvm(admin.owner)}</dd></div>
              <div><dt>Treasury</dt><dd>{shortEvm(admin.treasury)}</dd></div>
              <div><dt>New launches</dt><dd>{admin.paused ? 'Paused' : 'Open'}</dd></div>
              <div><dt>Unclaimed platform fees</dt><dd>{Number(formatEther(admin.platformFees)).toFixed(6)} {chain.native.symbol}</dd></div>
              <div><dt>Opening cap at today’s price</dt><dd>{currentOpening ? `$${Math.round(currentOpening).toLocaleString()}` : '—'}</dd></div>
            </dl>
            {!session ? <div className="lp-row">{wallets.map((w) => <button key={w.id} className="lp-btn lp-btn--secondary" onClick={async () => { try { setSession(await connectWallet(w, chain)); } catch (e) { setError(evmMessage(e)); } }}><Wallet size={15} /> Connect {w.name}</button>)}</div>
              : !isOwner ? <Notice>Connected wallet isn’t the owner.</Notice>
              : (
                <div className="lp-row">
                  <button className="lp-btn lp-btn--secondary" disabled={busy || !params} onClick={async () => { await act('Confirm in your wallet…', () => write(chain, session, { address: chain.pad!, abi: PAD_ABI, functionName: 'setParams', args: [params!.virtualNative, params!.virtualToken, params!.curveSupply] })); loadAdmin(); }}>Re-price to ${price?.toFixed(2)} {chain.native.symbol}</button>
                  <button className="lp-btn lp-btn--secondary" disabled={busy} onClick={async () => { await act('Confirm in your wallet…', () => write(chain, session, { address: chain.pad!, abi: PAD_ABI, functionName: 'setLaunchesPaused', args: [!admin.paused] })); loadAdmin(); }}>{admin.paused ? 'Resume launches' : 'Pause new launches'}</button>
                  <button className="lp-btn lp-btn--secondary" disabled={busy || admin.platformFees === 0n} onClick={async () => { await act('Confirm in your wallet…', () => write(chain, session, { address: chain.pad!, abi: PAD_ABI, functionName: 'claimPlatformFees' })); loadAdmin(); }}>Claim fees to treasury</button>
                </div>
              )}
          </section>
        )}
        <a className="lp-link" href={`/launchpad?chain=${key}`}>Open MochePad on {chain.name} <ArrowRight size={14} /></a>
      </div>
    </div>
  );
}
