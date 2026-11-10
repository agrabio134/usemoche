import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatEther, parseEther, decodeEventLog, maxUint256, type Address } from 'viem';
import {
  ArrowUpRight, ArrowRight, ArrowLeft, Search, Rocket, LayoutGrid, Wallet, ShieldCheck, Check, X, RefreshCw, Layers,
  LockKeyhole, CircleAlert, BookOpen, Upload, Megaphone, ExternalLink, Zap, Coins,
} from 'lucide-react';
import { readApiJson } from '../lib/http';
import { Field, Notice, PageTitle, CopyInline, format, go } from '../app/ui';
import { EVM_CHAINS, explorerAddress, explorerTx, type EvmChain, type EvmChainKey } from './chains';
import { OPENING_CAP_USD, GRADUATION_CAP_USD } from './params';
import {
  PAD_ABI, TOKEN_ABI, ROUTER_ABI, ERC20_ABI, publicClient, discoverWallets, connectWallet, ensureChain, listEvmMarkets, getEvmMarket,
  marketsCreatedBy, marketStats, tokenMetadata, evmMessage, shortEvm, write, type EvmWallet, type EvmSession, type EvmMarket,
} from './client';
import { Callouts } from '../callouts/Callouts';

const NAV = [
  ['markets', 'Markets', LayoutGrid],
  ['launch', 'Launch', Rocket],
  ['callouts', 'Callouts', Megaphone],
  ['portfolio', 'My activity', Wallet],
  ['how', 'How it works', BookOpen],
] as const;

type Ctx = {
  chain: EvmChain;
  session: EvmSession | null;
  connect: () => void;
  run: (label: string, fn: () => Promise<`0x${string}` | void>) => Promise<boolean>;
  busy: boolean;
  setStatus: (s: string) => void;
  nativeUsd: number | null;
};

export default function EvmApp({ chainKey }: { chainKey: EvmChainKey }) {
  const chain = EVM_CHAINS[chainKey];
  const [route, setRoute] = useState(location.hash.slice(1) || 'markets');
  const [session, setSession] = useState<EvmSession | null>(null);
  const [wallets, setWallets] = useState<EvmWallet[]>([]);
  const [walletOpen, setWalletOpen] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState('');
  const [rpc, setRpc] = useState('Connecting');
  const nativeUsd = useNativePrice(chain);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const h = () => setRoute(location.hash.slice(1) || 'markets');
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  useEffect(() => discoverWallets(setWallets), []);
  useEffect(() => { if (walletOpen) dialog.current?.showModal(); else dialog.current?.close(); }, [walletOpen]);
  useEffect(() => {
    publicClient(chain).getChainId().then((id) => setRpc(id === chain.id ? 'Connected' : 'Wrong network')).catch(() => setRpc('RPC unavailable'));
  }, [chain.key]);
  useEffect(() => {
    const p: any = session?.wallet.provider;
    if (!p?.on) return;
    const onAccounts = (a: string[]) => { if (!a?.length || a[0].toLowerCase() !== session!.address.toLowerCase()) setSession(null); };
    p.on('accountsChanged', onAccounts);
    return () => p.removeListener?.('accountsChanged', onAccounts);
  }, [session?.address]);

  async function connect(w: EvmWallet) {
    try { setError(''); setSession(await connectWallet(w, chain)); setWalletOpen(false); }
    catch (e) { setError(evmMessage(e)); }
  }

  async function run(label: string, fn: () => Promise<`0x${string}` | void>) {
    if (busy) return false;
    setBusy(true); setError(''); setTx(''); setStatus(label);
    try {
      if (session) await ensureChain(session.wallet.provider, chain);
      const hash = await fn();
      if (hash) {
        setTx(hash); setStatus('Waiting for confirmation…');
        const r = await publicClient(chain).waitForTransactionReceipt({ hash, timeout: 120_000 });
        if (r.status !== 'success') throw new Error('The transaction reverted on-chain. Nothing changed except the network fee.');
        setStatus(`Confirmed on ${chain.name}.`);
      } else setStatus('Completed.');
      return true;
    } catch (e) { setError(evmMessage(e)); setStatus(''); return false; }
    finally { setBusy(false); }
  }

  const base = route.split('?')[0].split('/')[0];
  const ctx: Ctx = { chain, session, connect: () => setWalletOpen(true), run, busy, setStatus, nativeUsd };

  return (
    <div className="lpx">
      <div className="lp-bar">
        <nav className="lp-tabs" aria-label="Launchpad">
          {NAV.map(([path, label, Icon]) => (
            <a key={path} href={`#${path}`} className={base === path || (path === 'markets' && base === 'market') ? 'is-on' : ''} aria-current={base === path ? 'page' : undefined}>
              <Icon size={16} /><span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="lp-bar__right">
          <span className={`lp-net ${rpc === 'Connected' ? 'is-ok' : ''}`} title={rpc}><i />{chain.name}</span>
          <button className="lp-btn lp-btn--primary lp-btn--sm" onClick={session ? () => setSession(null) : () => setWalletOpen(true)} aria-label={session ? `Disconnect wallet ${shortEvm(session.address)}` : 'Connect wallet'}>
            <Wallet size={16} /><span className="lp-wtext">{session ? shortEvm(session.address) : <>Connect<span className="lp-wtext__long"> wallet</span></>}</span>
          </button>
        </div>
      </div>

      <div className="lp-main">
        {rpc !== 'Connected' && rpc !== 'Connecting' && <Notice tone="warn">{chain.name} connection: {rpc}. Reading markets and sending transactions may fail until it recovers.</Notice>}
        {error && (
          <div className="lp-alert" role="alert"><CircleAlert size={18} /><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>
        )}
        {status && (
          <div className="lp-status" role="status">
            {busy ? <span className="lp-spinner" /> : <Check size={18} />} <span>{status}</span>
            {tx && <a href={explorerTx(chain, tx)} target="_blank" rel="noreferrer">View transaction <ArrowUpRight size={14} /></a>}
          </div>
        )}
        {base === 'callouts' ? <Callouts defaultChain={chain.key} />
          : !chain.pad ? <NotDeployed chain={chain} />
          : base === 'launch' ? <Studio {...ctx} />
          : base === 'portfolio' ? <Portfolio {...ctx} />
          : base === 'how' ? <How chain={chain} />
          : base === 'market' ? <Trade {...ctx} token={route.slice(7) as Address} />
          : <Markets {...ctx} />}
      </div>

      <dialog ref={dialog} onCancel={() => setWalletOpen(false)} onClick={(e) => { if (e.target === dialog.current) setWalletOpen(false); }} className="lp-wallets" aria-labelledby="lp-evm-wallets-title">
        <div className="lp-wallets__panel">
          <button className="lp-wallets__close" onClick={() => setWalletOpen(false)} aria-label="Close wallet selection"><X size={18} /></button>
          <span className="lp-ic lp-ic--solid"><Wallet size={22} /></span>
          <h2 id="lp-evm-wallets-title">Connect an EVM wallet</h2>
          <p>We’ll ask your wallet to switch to {chain.name} (chain {chain.id}). Every launch and trade is approved in your own wallet. usemoche never asks for your seed phrase.</p>
          {wallets.length ? wallets.map((w) => (
            <button className="lp-wallet" key={w.id} onClick={() => connect(w)}>
              {w.icon ? <img src={w.icon} alt="" /> : <Wallet size={22} />}{w.name}<ArrowRight size={16} />
            </button>
          )) : <Notice>No EVM wallet detected. Open this page in a browser with MetaMask, Rabby or another EVM wallet.</Notice>}
          <a className="lp-link" href="https://rabby.io" target="_blank" rel="noreferrer">Get Rabby <ArrowUpRight size={14} /></a>
        </div>
      </dialog>
    </div>
  );
}

/* ---------------- helpers ---------------- */
function useNativePrice(chain: EvmChain) {
  const [price, setPrice] = useState<number | null>(null);
  useEffect(() => {
    let active = true; setPrice(null);
    const load = () => fetch(`/api/market-data?mode=price&mint=${chain.priceMint}`).then((r) => r.json())
      .then((d) => { if (active && Number.isFinite(d.usd)) setPrice(d.usd); }).catch(() => {});
    load(); const t = setInterval(load, 30000);
    return () => { active = false; clearInterval(t); };
  }, [chain.key]);
  return price;
}

const usd = (n: number | null) => (n == null ? '—' : `$${n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 2 : 0 })}`);
const native = (wei: bigint) => format(Number(formatEther(wei)));

function useMeta(uri: string) {
  const [meta, setMeta] = useState<{ image?: string; description?: string; website?: string } | null>(null);
  useEffect(() => { let a = true; tokenMetadata(uri).then((m) => { if (a) setMeta(m); }); return () => { a = false; }; }, [uri]);
  return meta;
}

function Art({ m, size = 56 }: { m: EvmMarket; size?: number }) {
  const meta = useMeta(m.metadataURI);
  const [failed, setFailed] = useState(false);
  return (
    <span className={'token-avatar' + (size > 60 ? ' large' : '')}>
      {meta?.image && !failed ? <img src={meta.image} alt={m.name} referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} /> : m.symbol.slice(0, 2)}
    </span>
  );
}

function NotDeployed({ chain }: { chain: EvmChain }) {
  return (
    <>
      <ChainHero chain={chain} />
      <div className="lp-empty">
        <img src="/images/moche-wave-360.webp" width="96" height="95" alt="" />
        <h3>MochePad on {chain.name} opens soon.</h3>
        <p>The launch contracts for {chain.name} haven’t been switched on yet. Launches on Solana are live now, and you can already post and read callouts.</p>
        <div className="lp-row" style={{ justifyContent: 'center' }}>
          <a className="lp-btn lp-btn--secondary" href="/launchpad">Launch on Solana <ArrowRight size={16} /></a>
          <a className="lp-btn lp-btn--ghost" href="#callouts">See callouts <Megaphone size={16} /></a>
        </div>
      </div>
    </>
  );
}

function ChainHero({ chain, children }: { chain: EvmChain; children?: ReactNode }) {
  return (
    <section className="lp-hero">
      <div className="lp-hero__copy">
        <span className="lp-eyebrow"><Rocket size={14} /> MochePad on {chain.name}</span>
        <h1>Launch on {chain.name}.<br /><span>Trade in {chain.native.symbol}.</span></h1>
        <p>{chain.tagline}. Every launch gets a bonding curve priced in {chain.native.symbol}, then graduates into Uniswap V2 with the liquidity burned forever.</p>
        {children}
      </div>
      <img className="lp-hero__art" src="/images/moche-wave-m-440.webp" width="440" height="348" alt="" />
    </section>
  );
}

/* ---------------- Markets ---------------- */
function Markets({ chain, nativeUsd }: Ctx) {
  const [markets, setMarkets] = useState<EvmMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  async function refresh() {
    setLoading(true); setError('');
    try { setMarkets(await listEvmMarkets(chain)); } catch (e) { setError(evmMessage(e)); } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, [chain.key]);
  const filtered = markets.filter((m) => (filter === 'all' || (filter === 'curve' && !m.curve.graduated) || (filter === 'graduated' && m.curve.graduated))
    && `${m.name} ${m.symbol} ${m.token}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <ChainHero chain={chain}>
        <div className="lp-row">
          <button className="lp-btn lp-btn--primary" onClick={() => go('launch')}>Launch a token <ArrowUpRight size={18} /></button>
          <a className="lp-btn lp-btn--secondary" href="#how">How it works</a>
        </div>
      </ChainHero>
      <ul className="lp-facts" role="list">
        <li><Layers size={18} /><span>1B supply<strong>Fixed at launch</strong></span></li>
        <li><Coins size={18} /><span>{usd(OPENING_CAP_USD)} → {usd(GRADUATION_CAP_USD)}<strong>Opening → graduation cap</strong></span></li>
        <li><LockKeyhole size={18} /><span>LP burned<strong>On Uniswap V2</strong></span></li>
      </ul>
      <div className="lp-head">
        <div><span className="lp-eyebrow">Marketplace</span><h2>Live on {chain.name}</h2></div>
        <button className="lp-btn lp-btn--ghost lp-btn--sm" onClick={refresh} disabled={loading}><RefreshCw size={15} className={loading ? 'lp-spin' : ''} />Refresh</button>
      </div>
      <div className="lp-toolbar">
        <div className="lp-seg" role="group" aria-label="Filter markets">
          {[['all', 'All'], ['curve', 'On curve'], ['graduated', 'Graduated']].map(([v, l]) => <button key={v} aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>)}
        </div>
        <label className="lp-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or address" aria-label="Search markets" /></label>
      </div>
      {error ? <div className="lp-empty"><CircleAlert /><h3>Market data is unavailable.</h3><p>{error}</p><button className="lp-btn lp-btn--secondary" onClick={refresh}>Retry</button></div>
        : loading ? <div className="lp-empty"><span className="lp-spinner" /><p>Reading launches from {chain.name}…</p></div>
        : filtered.length ? <div className="lp-grid">{filtered.map((m) => <Card key={m.token} m={m} chain={chain} nativeUsd={nativeUsd} />)}</div>
        : <div className="lp-empty"><img src="/images/moche-wave-360.webp" width="96" height="95" alt="" /><h3>{markets.length ? 'No matching markets.' : 'No launches yet.'}</h3><p>{markets.length ? 'Try another filter or search.' : `Be the first to launch on ${chain.name}.`}</p><button className="lp-btn lp-btn--secondary" onClick={() => go('launch')}>Open launch studio <ArrowRight size={16} /></button></div>}
      <p className="lp-foot"><ShieldCheck size={15} />Listings are read from the MochePad contract on {chain.name}. A listing is not an endorsement.</p>
    </>
  );
}

function Card({ m, chain, nativeUsd }: { m: EvmMarket; chain: EvmChain; nativeUsd: number | null }) {
  const s = marketStats(m, nativeUsd);
  return (
    <button className="lp-card" onClick={() => go('market/' + m.token)}>
      <div className="lp-card__top">
        <Art m={m} />
        <div className="lp-card__name"><h3>{m.name}</h3><span>{m.symbol} / {chain.native.symbol}</span></div>
        {m.curve.graduated ? <span className="lp-pill">Uniswap</span> : <ArrowUpRight size={18} />}
      </div>
      <div className="lp-card__stats">
        <span>Market cap<strong>{s.capUsd ? usd(s.capUsd) : `${format(s.capNative)} ${chain.native.symbol}`}</strong></span>
        <span>Stage<strong>{m.curve.graduated ? 'Graduated' : 'Bonding curve'}</strong></span>
      </div>
      <div className="lp-progress" aria-hidden="true"><i style={{ width: `${s.progress * 100}%` }} /></div>
      <div className="lp-card__foot"><span>{m.curve.graduated ? 'Graduated' : 'Curve progress'}</span><b>{(s.progress * 100).toFixed(1)}%</b></div>
    </button>
  );
}

/* ---------------- Studio ---------------- */
const STEPS = ['Identity', 'Fees', 'Review'];
function Studio({ chain, session, connect, run, busy, setStatus, nativeUsd }: Ctx) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [uri, setUri] = useState('');
  const [uploadedFor, setUploadedFor] = useState('');
  const [fee, setFee] = useState(200);
  const [shield, setShield] = useState(true);
  const [devBuy, setDevBuy] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [uploadEnabled, setUploadEnabled] = useState(true);
  const [uploading, setUploading] = useState(false);
  useEffect(() => { fetch('/api/status').then((r) => r.json()).then((d) => setUploadEnabled(!!d.uploadsEnabled)).catch(() => {}); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const identity = JSON.stringify([name.trim(), symbol, description, website, file?.name, file?.size]);
  const prepared = !!uri && uploadedFor === identity;
  const validIdentity = () => {
    if (!name.trim() || new TextEncoder().encode(name.trim()).length > 32) throw new Error('Enter a token name up to 32 bytes.');
    if (!/^[A-Z0-9]{2,10}$/.test(symbol)) throw new Error('Enter a 2–10 character ticker (A–Z, 0–9).');
    if (website) { let ok = false; try { ok = new URL(website).protocol === 'https:'; } catch {} if (!ok) throw new Error('Your website must be a valid HTTPS URL.'); }
    if (!file) throw new Error('Upload a token image to continue.');
  };

  async function upload() {
    if (!session) { connect(); return false; }
    setUploading(true); setStatus('Uploading artwork and creating token metadata…');
    try {
      const data = new Uint8Array(await file!.arrayBuffer());
      const b64 = btoa(Array.from(data, (x) => String.fromCharCode(x)).join(''));
      const r = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(55000), body: JSON.stringify({ address: session.address, image: b64, type: file!.type, name: name.trim(), symbol, description, website }) });
      const d = await readApiJson(r, 'Image upload');
      if (typeof d.uri !== 'string') throw new Error('The upload service returned an incomplete result. Please retry.');
      setUri(d.uri); setUploadedFor(identity); setStatus('Image uploaded. You can continue.');
      return true;
    } catch (e) { setError(evmMessage(e)); setStatus(''); return false; }
    finally { setUploading(false); }
  }

  async function next() {
    setError('');
    try {
      if (step === 0) {
        validIdentity();
        if (!uploadEnabled) throw new Error('Image upload is temporarily unavailable. Please try again shortly.');
        if (!prepared && !(await upload())) return;
      }
      if (step === 1 && devBuy) { const v = Number(devBuy); if (!Number.isFinite(v) || v < 0) throw new Error(`Enter a valid ${chain.native.symbol} amount for your first buy, or leave it empty.`); }
      setStep((s) => Math.min(2, s + 1));
    } catch (e) { setError(evmMessage(e)); }
  }

  async function launch() {
    if (!session || !chain.pad) return connect();
    let token: Address | null = null;
    const ok = await run('Confirm the launch in your wallet…', async () => {
      const pc = publicClient(chain);
      const value = devBuy ? parseEther(devBuy) : 0n;
      let minOut = 0n;
      if (value > 0n) {
        const [vN, vT, cs] = (await Promise.all(['virtualNative', 'virtualToken', 'curveSupply'].map((f) => pc.readContract({ address: chain.pad!, abi: PAD_ABI, functionName: f })))) as bigint[];
        const net = value - (value * BigInt(fee)) / 10_000n;
        let out = (vT * net) / (vN + net); if (out > cs) out = cs;
        minOut = (out * 99n) / 100n;
        const bal = await pc.getBalance({ address: session.address });
        if (bal <= value) throw new Error(`Your first buy is more than this wallet’s ${chain.native.symbol} balance.`);
      }
      const hash = await write(chain, session, { address: chain.pad!, abi: PAD_ABI, functionName: 'createToken', args: [name.trim(), symbol, uri, fee, shield, minOut], value });
      const receipt = await pc.waitForTransactionReceipt({ hash, timeout: 120_000 });
      for (const l of receipt.logs) { try { const e: any = decodeEventLog({ abi: PAD_ABI, data: l.data, topics: l.topics }); if (e.eventName === 'TokenCreated') token = e.args.token; } catch {} }
      return hash;
    });
    if (ok && token) go('market/' + token);
  }

  return (
    <>
      <PageTitle label={`Launch studio · ${chain.name}`} title="Launch your token." copy={`Create a fixed-supply ERC-20 and its ${chain.native.symbol} bonding curve in one transaction. It graduates into Uniswap V2 with the liquidity burned.`} />
      <div className="lp-studio">
        <fieldset className="lp-panel lp-studio__main" disabled={busy || uploading}>
          <ol className="lp-stepper" role="list">
            {STEPS.map((s, i) => (
              <li key={s}><button className={step === i ? 'is-current' : step > i ? 'is-done' : ''} onClick={() => { if (i < step) setStep(i); }} disabled={i > step} aria-current={step === i ? 'step' : undefined}><span>{step > i ? <Check size={13} /> : i + 1}</span><em>{s}</em></button></li>
            ))}
          </ol>
          {error && <Notice tone="warn">{error}</Notice>}

          {step === 0 && (
            <div className="lp-form">
              <h2>Token identity</h2>
              <p className="lp-muted">1 billion tokens · 18 decimals · no owner, no mint function.</p>
              <div className="lp-fields2">
                <Field label="Token name"><input maxLength={32} value={name} onChange={(e) => setName(e.target.value)} placeholder="Moon Mochi" /></Field>
                <Field label="Ticker"><input maxLength={10} value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="MOCHI" /></Field>
              </div>
              <Field label="Description"><textarea maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is it about?" rows={3} /></Field>
              <Field label="Website (optional)"><input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" /></Field>
              <div className="lp-upload">
                <label className={`lp-drop ${!uploadEnabled ? 'is-off' : ''}`}>
                  <span className="lp-drop__img">{preview ? <img src={preview} alt="Selected token image" /> : <Upload size={26} />}</span>
                  <span className="lp-drop__text"><strong>{file ? file.name : 'Upload token image'}</strong><small>PNG, JPG or WebP · up to 2 MB · square works best</small></span>
                  <input type="file" aria-label="Token image" disabled={!uploadEnabled} accept="image/png,image/jpeg,image/webp" onChange={(e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    if (f.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) { setError('Choose a PNG, JPG or WebP image under 2 MB.'); e.target.value = ''; return; }
                    setError(''); setFile(f); if (preview) URL.revokeObjectURL(preview); setPreview(URL.createObjectURL(f));
                  }} />
                </label>
                <p className="lp-help">{!uploadEnabled ? 'Image upload is temporarily unavailable.' : prepared ? <span className="lp-ok"><Check size={15} />Image saved · token details ready</span> : uploading ? 'Uploading your image…' : !session ? 'Connect your wallet when you continue. No signature needed to upload.' : 'Your image and token details are stored on IPFS when you continue.'}</p>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="lp-form">
              <h2>Fees &amp; first buy</h2>
              <p className="lp-muted">Every launch opens at {usd(OPENING_CAP_USD)} and graduates at about {usd(GRADUATION_CAP_USD)}{nativeUsd ? <> ({chain.native.symbol} at {usd(nativeUsd)})</> : null}.</p>
              <div className="lp-field">
                <span className="lp-field__label">Trading fee</span>
                <div className="lp-choices">
                  {[100, 200, 300].map((f) => <button key={f} aria-pressed={fee === f} onClick={() => setFee(f)}><strong>{f / 100}%</strong><small>{f === 100 ? 'Lower friction' : f === 200 ? 'Balanced' : 'Higher fee'}</small></button>)}
                </div>
              </div>
              <label className="lp-switch"><ShieldCheck size={20} /><span><strong>Launch fee protection</strong><small>Starts at 10% and falls to your fee over 5 minutes, to slow snipers.</small></span><input type="checkbox" checked={shield} onChange={(e) => setShield(e.target.checked)} /></label>
              <Field label={`Your first buy (optional, ${chain.native.symbol})`} hint="Bought in the same transaction as the launch, at your base fee, before anyone else can trade.">
                <input inputMode="decimal" value={devBuy} onChange={(e) => setDevBuy(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.0" />
              </Field>
              <div className="lp-info"><LockKeyhole size={19} /><p><strong>Liquidity is burned.</strong> When the curve sells out, the raised {chain.native.symbol} and the reserved tokens go into a Uniswap V2 pool and the LP tokens are sent to a dead address. Nobody can pull them.</p></div>
            </div>
          )}

          {step === 2 && (
            <div className="lp-form">
              <h2>Review &amp; launch</h2>
              <p className="lp-muted">These settings are permanent once the transaction confirms.</p>
              <dl className="lp-dl">
                <div><dt>Token</dt><dd>{name} · ${symbol}</dd></div>
                <div><dt>Network</dt><dd>{chain.name} · chain {chain.id}</dd></div>
                <div><dt>Supply</dt><dd>1,000,000,000 · 18 decimals</dd></div>
                <div><dt>Pair</dt><dd>{chain.native.symbol} (native)</dd></div>
                <div><dt>Trading fee</dt><dd>{shield ? '10% → ' : ''}{fee / 100}%</dd></div>
                <div><dt>Creator / platform</dt><dd>50% / 50%</dd></div>
                <div><dt>First buy</dt><dd>{devBuy ? `${devBuy} ${chain.native.symbol}` : 'None'}</dd></div>
                <div><dt>Graduation</dt><dd>Uniswap V2 · LP burned</dd></div>
                <div><dt>Image</dt><dd>{preview ? <img className="lp-thumb" src={preview} alt="" /> : '—'}</dd></div>
              </dl>
              <Notice tone="warn">MochePad’s EVM contracts are new and have not been independently audited. Launch and trade only what you can afford to lose.</Notice>
              <label className="lp-check"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /><span>I’ve reviewed the settings and understand the contracts are unaudited.</span></label>
            </div>
          )}

          <div className="lp-studio__foot">
            <button className="lp-btn lp-btn--ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}><ArrowLeft size={15} />Back</button>
            {step < 2 ? <button className="lp-btn lp-btn--primary" onClick={next}>{uploading ? 'Uploading…' : 'Continue'} <ArrowRight size={16} /></button>
              : !session ? <button className="lp-btn lp-btn--primary" onClick={connect}>Connect wallet <Wallet size={16} /></button>
              : <button className="lp-btn lp-btn--primary" disabled={!agreed || !prepared || busy} onClick={launch}>{busy ? 'Working…' : `Launch on ${chain.name}`}<Rocket size={16} /></button>}
          </div>
        </fieldset>
        <aside className="lp-panel lp-summary" aria-label="Launch summary">
          <div className="lp-summary__art">{preview ? <img src={preview} alt="Token artwork" /> : <img src="/images/moche-avatar-256.webp" alt="" />}</div>
          <h3>{name || 'Your token'}</h3>
          <span className="lp-muted">${symbol || 'TICKER'} / {chain.native.symbol}</span>
          <dl className="lp-dl lp-dl--tight">
            <div><dt>Opening cap</dt><dd>{usd(OPENING_CAP_USD)}</dd></div>
            <div><dt>Graduation</dt><dd>≈ {usd(GRADUATION_CAP_USD)}</dd></div>
            <div><dt>Fee</dt><dd>{fee / 100}%</dd></div>
            <div><dt>Network</dt><dd>{chain.name}</dd></div>
          </dl>
          <p className="lp-help"><ShieldCheck size={14} /> Your wallet signs every transaction.</p>
        </aside>
      </div>
    </>
  );
}

/* ---------------- Trade ---------------- */
function Trade({ chain, session, connect, run, busy, nativeUsd, token }: Ctx & { token: Address }) {
  const [m, setM] = useState<EvmMarket | null | undefined>(undefined);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<{ out: bigint; fee?: bigint; refund?: bigint } | null>(null);
  const [balances, setBalances] = useState<{ native: bigint; token: bigint } | null>(null);
  const [slip, setSlip] = useState(2);
  const [err, setErr] = useState('');
  const meta = useMeta(m?.metadataURI || '');

  const load = async () => {
    try { setM(await getEvmMarket(chain, token)); } catch (e) { setErr(evmMessage(e)); setM(null); }
    if (session) {
      const pc = publicClient(chain);
      const [n, t] = await Promise.all([pc.getBalance({ address: session.address }), pc.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [session.address] })]).catch(() => [0n, 0n]);
      setBalances({ native: n as bigint, token: t as bigint });
    }
  };
  useEffect(() => { load(); }, [token, session?.address]);

  const parsed = (() => { try { return amount && Number(amount) > 0 ? parseEther(amount) : 0n; } catch { return 0n; } })();
  useEffect(() => {
    setQuote(null); if (!m || !parsed) return;
    let a = true;
    const pc = publicClient(chain);
    const t = setTimeout(async () => {
      try {
        if (!m.curve.graduated) {
          if (side === 'buy') { const [out, fee, refund] = (await pc.readContract({ address: chain.pad!, abi: PAD_ABI, functionName: 'quoteBuy', args: [token, parsed] })) as bigint[]; if (a) setQuote({ out, fee, refund }); }
          else { const [out, fee] = (await pc.readContract({ address: chain.pad!, abi: PAD_ABI, functionName: 'quoteSell', args: [token, parsed] })) as bigint[]; if (a) setQuote({ out, fee }); }
        } else {
          const path = side === 'buy' ? [chain.weth, token] : [token, chain.weth];
          const weth = (await pc.readContract({ address: chain.v2Router, abi: ROUTER_ABI, functionName: 'WETH' })) as Address;
          if (side === 'buy') path[0] = weth; else path[1] = weth;
          const amounts = (await pc.readContract({ address: chain.v2Router, abi: ROUTER_ABI, functionName: 'getAmountsOut', args: [parsed, path] })) as bigint[];
          if (a) setQuote({ out: amounts[amounts.length - 1] });
        }
      } catch { if (a) setQuote(null); }
    }, 300);
    return () => { a = false; clearTimeout(t); };
  }, [m?.token, m?.curve.graduated, side, parsed]);

  if (m === undefined) return <div className="lp-empty"><span className="lp-spinner" /><p>Loading market…</p></div>;
  if (!m) return <div className="lp-empty"><CircleAlert /><h3>Market not found on {chain.name}.</h3><p>{err || 'Check the address, or switch chains.'}</p><button className="lp-btn lp-btn--secondary" onClick={() => go('markets')}>All markets</button></div>;
  const s = marketStats(m, nativeUsd);
  const minOut = quote ? (quote.out * BigInt(Math.round((100 - slip) * 100))) / 10_000n : 0n;

  async function submit() {
    if (!session) return connect();
    if (!quote || !parsed) return;
    const ok = await run(side === 'buy' ? 'Confirm the buy in your wallet…' : 'Confirm the sell in your wallet…', async () => {
      const c = session.client; const acct = session.address;
      if (!m!.curve.graduated) {
        if (side === 'buy') return write(chain, session, { address: chain.pad!, abi: PAD_ABI, functionName: 'buy', args: [token, minOut], value: parsed });
        return write(chain, session, { address: chain.pad!, abi: PAD_ABI, functionName: 'sell', args: [token, parsed, minOut] });
      }
      const pc = publicClient(chain);
      const weth = (await pc.readContract({ address: chain.v2Router, abi: ROUTER_ABI, functionName: 'WETH' })) as Address;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      if (side === 'buy') return write(chain, session, { address: chain.v2Router, abi: ROUTER_ABI, functionName: 'swapExactETHForTokensSupportingFeeOnTransferTokens', args: [minOut, [weth, token], acct, deadline], value: parsed });
      const allowance = (await pc.readContract({ address: token, abi: ERC20_ABI, functionName: 'allowance', args: [acct, chain.v2Router] })) as bigint;
      if (allowance < parsed) {
        const h = await write(chain, session, { address: token, abi: ERC20_ABI, functionName: 'approve', args: [chain.v2Router, maxUint256] });
        await pc.waitForTransactionReceipt({ hash: h, timeout: 120_000 });
      }
      return write(chain, session, { address: chain.v2Router, abi: ROUTER_ABI, functionName: 'swapExactTokensForETHSupportingFeeOnTransferTokens', args: [parsed, minOut, [token, weth], acct, deadline] });
    });
    if (ok) { setAmount(''); load(); }
  }

  const unitIn = side === 'buy' ? chain.native.symbol : m.symbol;
  const unitOut = side === 'buy' ? m.symbol : chain.native.symbol;
  return (
    <>
      <button className="lp-back" onClick={() => go('markets')}><ArrowLeft size={15} /> All markets</button>
      <div className="lp-trade">
        <section className="lp-panel">
          <div className="lp-card__top">
            <Art m={m} size={72} />
            <div className="lp-card__name"><h1 className="lp-h2" style={{ margin: 0 }}>{m.name}</h1><span>${m.symbol} / {chain.native.symbol} · {chain.name}</span></div>
            <span className="lp-pill">{m.curve.graduated ? 'Uniswap V2' : 'Bonding curve'}</span>
          </div>
          {meta?.description && <p className="lp-muted">{meta.description}</p>}
          <dl className="lp-dl">
            <div><dt>Market cap</dt><dd>{s.capUsd ? usd(s.capUsd) : '—'} · {format(s.capNative)} {chain.native.symbol}</dd></div>
            <div><dt>Price</dt><dd>{s.priceNative.toExponential(3)} {chain.native.symbol}</dd></div>
            <div><dt>Raised on curve</dt><dd>{format(s.raised)} {chain.native.symbol}</dd></div>
            <div><dt>Fee</dt><dd>{m.curve.feeBps / 100}%{m.curve.protection ? ' · launch protection' : ''}</dd></div>
            <div><dt>Token</dt><dd><a className="lp-addr" href={explorerAddress(chain, m.token)} target="_blank" rel="noreferrer">{shortEvm(m.token)} <ExternalLink size={12} /></a> <CopyInline value={m.token} label="Copy token address" /></dd></div>
            <div><dt>Creator</dt><dd><a className="lp-addr" href={explorerAddress(chain, m.curve.creator)} target="_blank" rel="noreferrer">{shortEvm(m.curve.creator)} <ExternalLink size={12} /></a></dd></div>
            {m.curve.graduated && <div><dt>Uniswap pair</dt><dd><a className="lp-addr" href={explorerAddress(chain, m.pair)} target="_blank" rel="noreferrer">{shortEvm(m.pair)} <ExternalLink size={12} /></a></dd></div>}
            {meta?.website && <div><dt>Website</dt><dd><a className="lp-addr" href={meta.website} target="_blank" rel="noreferrer nofollow">{new URL(meta.website).host} <ExternalLink size={12} /></a></dd></div>}
          </dl>
          <div className="lp-progress" aria-hidden="true"><i style={{ width: `${s.progress * 100}%` }} /></div>
          <div className="lp-card__foot"><span>{m.curve.graduated ? 'Graduated to Uniswap V2' : 'Curve progress'}</span><b>{(s.progress * 100).toFixed(1)}%</b></div>
        </section>

        <section className="lp-panel">
          <div className="lp-seg" role="group" aria-label="Trade side">
            <button aria-pressed={side === 'buy'} onClick={() => { setSide('buy'); setAmount(''); }}>Buy</button>
            <button aria-pressed={side === 'sell'} onClick={() => { setSide('sell'); setAmount(''); }}>Sell</button>
          </div>
          <Field label={`Amount (${unitIn})`} hint={balances ? <>Balance: {native(side === 'buy' ? balances.native : balances.token)} {unitIn}</> : undefined}>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.0" />
          </Field>
          {side === 'sell' && balances && balances.token > 0n && (
            <div className="lp-row">{[25, 50, 100].map((p) => <button key={p} className="lp-btn lp-btn--ghost lp-btn--sm" onClick={() => setAmount(formatEther((balances.token * BigInt(p)) / 100n))}>{p}%</button>)}</div>
          )}
          <dl className="lp-dl lp-dl--tight">
            <div><dt>You receive (est.)</dt><dd>{quote ? `${native(quote.out)} ${unitOut}` : '—'}</dd></div>
            {quote?.fee != null && <div><dt>Trading fee</dt><dd>{native(quote.fee)} {chain.native.symbol}</dd></div>}
            {quote?.refund ? <div><dt>Refunded (curve sells out)</dt><dd>{native(quote.refund)} {chain.native.symbol}</dd></div> : null}
            <div><dt>Slippage limit</dt><dd><select value={slip} onChange={(e) => setSlip(Number(e.target.value))} aria-label="Slippage">{[1, 2, 5, 10].map((v) => <option key={v} value={v}>{v}%</option>)}</select></dd></div>
          </dl>
          {m.curve.graduated && <p className="lp-help"><Zap size={14} /> Graduated: this trade routes through Uniswap V2 on {chain.name}.{side === 'sell' ? ' Selling needs a one-time token approval.' : ''}</p>}
          {!session ? <button className="lp-btn lp-btn--primary" onClick={connect}>Connect wallet <Wallet size={16} /></button>
            : <button className="lp-btn lp-btn--primary" disabled={busy || !quote || !parsed} onClick={submit}>{busy ? 'Working…' : side === 'buy' ? `Buy ${m.symbol}` : `Sell ${m.symbol}`}</button>}
          <p className="lp-foot"><ShieldCheck size={15} />Trades settle on-chain. Prices can fall to zero.</p>
        </section>
      </div>
    </>
  );
}

/* ---------------- Portfolio ---------------- */
function Portfolio({ chain, session, connect, run, busy, nativeUsd }: Ctx) {
  const [list, setList] = useState<EvmMarket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [admin, setAdmin] = useState<{ owner: Address; treasury: Address; platformFees: bigint } | null>(null);
  const load = () => {
    if (!session) { setList([]); return; }
    setLoading(true); setError('');
    marketsCreatedBy(chain, session.address).then(setList).catch((e) => setError(evmMessage(e))).finally(() => setLoading(false));
    const pc = publicClient(chain);
    Promise.all(['owner', 'treasury', 'platformFees'].map((f) => pc.readContract({ address: chain.pad!, abi: PAD_ABI, functionName: f })))
      .then(([owner, treasury, platformFees]: any) => setAdmin({ owner, treasury, platformFees })).catch(() => {});
  };
  useEffect(load, [session?.address, chain.key]);
  const isAdmin = !!session && !!admin && [admin.owner, admin.treasury].some((a) => a.toLowerCase() === session.address.toLowerCase());
  return (
    <>
      <PageTitle label="My activity" title="Your launches and fees." copy={`Tokens you launched on ${chain.name}. Your 50% share of curve fees builds up in ${chain.native.symbol}; claim it any time.`} />
      {!session ? (
        <div className="lp-empty"><span className="lp-ic"><Wallet size={22} /></span><h3>Connect your wallet to see your launches.</h3><button className="lp-btn lp-btn--primary" onClick={connect}>Connect wallet</button></div>
      ) : (
        <>
          {isAdmin && admin && (
            <div className="lp-panel lp-head">
              <div><span className="lp-eyebrow">Platform fees</span><h3>{native(admin.platformFees)} {chain.native.symbol}</h3><p className="lp-muted">Paid to the treasury {shortEvm(admin.treasury)}.</p></div>
              <button className="lp-btn lp-btn--secondary lp-btn--sm" disabled={busy || admin.platformFees === 0n} onClick={async () => { if (await run('Confirm in your wallet…', () => write(chain, session, { address: chain.pad!, abi: PAD_ABI, functionName: 'claimPlatformFees' }))) load(); }}>Claim to treasury</button>
            </div>
          )}
          {error ? <Notice tone="warn">{error}</Notice>
            : loading ? <div className="lp-empty"><span className="lp-spinner" />Loading your launches…</div>
            : list.length ? (
              <div className="lp-grid">
                {list.map((m) => (
                  <div key={m.token} className="lp-stack">
                    <Card m={m} chain={chain} nativeUsd={nativeUsd} />
                    <div className="lp-panel lp-head lp-head--tight">
                      <span>Your fees<strong style={{ display: 'block' }}>{native(m.curve.creatorFees)} {chain.native.symbol}</strong></span>
                      <button className="lp-btn lp-btn--secondary lp-btn--sm" disabled={busy || m.curve.creatorFees === 0n} onClick={async () => { if (await run('Confirm in your wallet…', () => write(chain, session, { address: chain.pad!, abi: PAD_ABI, functionName: 'claimCreatorFees', args: [m.token] }))) load(); }}>Claim</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="lp-empty"><img src="/images/moche-wave-360.webp" width="96" height="95" alt="" /><h3>No launches from this wallet on {chain.name}.</h3><button className="lp-btn lp-btn--secondary" onClick={() => go('launch')}>Launch your first token</button></div>}
        </>
      )}
    </>
  );
}

/* ---------------- How it works ---------------- */
function How({ chain }: { chain: EvmChain }) {
  return (
    <>
      <PageTitle label="How it works" title={`MochePad on ${chain.name}.`} copy="One contract runs every launch. You approve every step in your own wallet." />
      <div className="lp-two">
        <article className="lp-panel">
          <ol className="lp-steps">
            <li><b>1</b><div><h3>Create your token</h3><p>A fixed 1B-supply ERC-20 with no owner and no mint function, plus its bonding curve, in one transaction.</p></div></li>
            <li><b>2</b><div><h3>Trade on the curve</h3><p>Buys and sells move the price along a constant-product curve priced in {chain.native.symbol}. Opening market cap is about {usd(OPENING_CAP_USD)}.</p></div></li>
            <li><b>3</b><div><h3>Graduate to Uniswap</h3><p>When the curve sells out (about {usd(GRADUATION_CAP_USD)} market cap), the raised {chain.native.symbol} and reserved tokens seed a Uniswap V2 pool at the same price, and the LP tokens are burned.</p></div></li>
          </ol>
        </article>
        <article className="lp-panel">
          <h2>Where fees go</h2>
          <p>You choose a 1%, 2% or 3% curve trading fee, split evenly:</p>
          <div className="lp-split"><span>Creator · 50%</span><span>Platform · 50%</span></div>
          <p>After graduation, trades pay the standard Uniswap V2 0.3% pool fee, which stays in the burned liquidity.</p>
          <dl className="lp-dl">
            <div><dt>Supply</dt><dd>1,000,000,000 · 18 decimals</dd></div>
            <div><dt>Network</dt><dd>{chain.name} · chain {chain.id}</dd></div>
            <div><dt>Gas &amp; pair</dt><dd>{chain.native.symbol}</dd></div>
            {chain.pad && <div><dt>MochePad contract</dt><dd><a className="lp-addr" href={explorerAddress(chain, chain.pad)} target="_blank" rel="noreferrer">{shortEvm(chain.pad)} <ExternalLink size={12} /></a></dd></div>}
          </dl>
        </article>
      </div>
      <Notice tone="warn">MochePad’s EVM contracts are new and have not been independently audited. Launching and trading tokens is risky; prices can fall to zero. Nothing here is financial advice. <a href={chain.docs} target="_blank" rel="noreferrer">{chain.name} docs</a></Notice>
    </>
  );
}


