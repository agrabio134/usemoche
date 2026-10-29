import { useEffect, useRef, useState } from 'react';
import { getWallets } from '@wallet-standard/app';
import {
  ArrowUpRight, ArrowRight, Search, Rocket, LayoutGrid, ChartNoAxesCombined, Wallet, ShieldCheck,
  Check, X, RefreshCw, Layers, LockKeyhole, CircleAlert, Zap, BookOpen,
} from 'lucide-react';
import { CORE_ASSETS, HYPE, PLATFORM_WALLET, MAINNET_GENESIS, type Asset } from '../lib/constants';
import { OPENING_MARKET_CAP_USD, GRADUATION_MARKET_CAP_USD } from '../lib/launch-policy';
import { connection, listMarkets, short, type Market, type WalletSession } from './chain';
import { TokenArtwork } from './TokenDetails';
import { LaunchStudio } from './Studio';
import { Trade } from './Trade';
import { Address, AssetIcon, Notice, PageTitle, format, go, message, marketPairLabel } from './ui';

const NAV = [
  ['markets', 'Markets', LayoutGrid],
  ['launch', 'Launch', Rocket],
  ['pairs', 'Pairs', ChartNoAxesCombined],
  ['portfolio', 'My activity', Wallet],
  ['how', 'How it works', BookOpen],
] as const;

export default function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || 'markets');
  const [assets, setAssets] = useState<Asset[]>(CORE_ASSETS);
  const [catalogError, setCatalogError] = useState('');
  const [session, setSession] = useState<WalletSession | null>(null);
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletList, setWalletList] = useState<readonly any[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [rpc, setRpc] = useState('Connecting');
  const [lastSignature, setLastSignature] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const h = () => setRoute(location.hash.slice(1) || 'markets');
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  useEffect(() => {
    const wallets = getWallets();
    const update = () => setWalletList(wallets.get().filter((w) => w.chains.includes('solana:mainnet')));
    update();
    const a = wallets.on('register', update), b = wallets.on('unregister', update);
    return () => { a(); b(); };
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/assets')
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        const list: Asset[] = d.assets || CORE_ASSETS;
        // Keep HYPE first and marked as the featured Hyperliquid pair.
        const merged = [...CORE_ASSETS, ...list.filter((a) => !CORE_ASSETS.some((c) => c.mint === a.mint))];
        setAssets(merged);
        setCatalogError(d.error || '');
      })
      .catch(() => setCatalogError('Stock catalogue unavailable. Retry shortly.'));
    connection.getGenesisHash()
      .then((v) => setRpc(v === MAINNET_GENESIS ? 'Connected' : 'Wrong network'))
      .catch(() => setRpc('RPC unavailable'));
    return () => { active = false; };
  }, []);

  useEffect(() => { if (walletOpen) dialog.current?.showModal(); else dialog.current?.close(); }, [walletOpen]);

  useEffect(() => {
    if (!session) return;
    const events = session.wallet.features['standard:events'];
    return events?.on('change', (event: any) => {
      if (event.accounts) {
        const account = event.accounts.find((a: any) => a.address === session.address);
        if (!account) setSession(null); else setSession({ ...session, account });
      }
    });
  }, [session?.address]);

  async function connect(wallet: any) {
    try {
      setError('');
      const r = await wallet.features['standard:connect'].connect();
      const account = r.accounts.find((a: any) => a.chains.includes('solana:mainnet'));
      if (!account) throw new Error('Enable Solana mainnet in this wallet.');
      setSession({ wallet, account, address: account.address });
      setWalletOpen(false);
    } catch (e) { setError(message(e)); }
  }
  async function disconnect() { await session?.wallet.features['standard:disconnect']?.disconnect(); setSession(null); }

  async function action(fn: () => Promise<string | void>) {
    if (busy) return;
    setBusy(true); setError(''); setStatus('Preparing…'); setLastSignature('');
    try {
      const sig = await fn();
      if (sig) { setLastSignature(sig); setStatus('Confirmed on Solana mainnet.'); }
      else setStatus((s) => (s === 'Preparing…' ? 'Completed.' : s));
    } catch (e) { setError(message(e)); setStatus(''); }
    finally { setBusy(false); }
  }

  const openWallet = () => setWalletOpen(true);
  const base = route.split('?')[0].split('/')[0];
  const common = { session, connect: openWallet, action, busy, setStatus };

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
          <span className={`lp-net ${rpc === 'Connected' ? 'is-ok' : ''}`} title={rpc === 'Connected' ? 'Mainnet connection verified' : rpc}>
            <i />Solana
          </span>
          <button className="lp-btn lp-btn--primary lp-btn--sm" onClick={session ? disconnect : openWallet} aria-label={session ? `Disconnect wallet ${short(session.address)}` : 'Connect wallet'}>
            <Wallet size={16} /><span className="lp-wtext">{session ? short(session.address) : <>Connect<span className="lp-wtext__long"> wallet</span></>}</span>
          </button>
        </div>
      </div>

      <div className="lp-main">
        {rpc !== 'Connected' && rpc !== 'Connecting' && (
          <Notice tone="warn">Solana connection: {rpc}. Reading markets and sending transactions may fail until it recovers.</Notice>
        )}
        {error && (
          <div className="lp-alert" role="alert">
            <CircleAlert size={18} /><span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button>
          </div>
        )}
        <PendingTransaction />
        {status && (
          <div className="lp-status" role="status">
            {busy ? <span className="lp-spinner" /> : <Check size={18} />} <span>{status}</span>
            {lastSignature && <a href={`https://solscan.io/tx/${lastSignature}`} target="_blank" rel="noreferrer">View transaction <ArrowUpRight size={14} /></a>}
          </div>
        )}

        {base === 'launch' ? <LaunchStudio assets={assets} {...common} />
          : base === 'pairs' ? <Pairs assets={assets} catalogError={catalogError} />
          : base === 'portfolio' ? <Portfolio assets={assets} session={session} connect={openWallet} />
          : base === 'how' ? <HowItWorks />
          : base === 'market' ? <Trade address={route.slice(7)} assets={assets} {...common} />
          : <Markets assets={assets} />}
      </div>

      <dialog ref={dialog} onCancel={() => setWalletOpen(false)} onClick={(e) => { if (e.target === dialog.current) setWalletOpen(false); }} className="lp-wallets" aria-labelledby="lp-wallets-title">
        <div className="lp-wallets__panel">
          <button className="lp-wallets__close" onClick={() => setWalletOpen(false)} aria-label="Close wallet selection"><X size={18} /></button>
          <span className="lp-ic lp-ic--solid"><Wallet size={22} /></span>
          <h2 id="lp-wallets-title">Connect a Solana wallet</h2>
          <p>Every launch, trade and claim is approved in your own wallet. usemoche never asks for your seed phrase or private key.</p>
          {walletList.length ? walletList.map((w) => (
            <button className="lp-wallet" key={w.name} onClick={() => connect(w)}>
              <img src={w.icon} alt="" />{w.name}<ArrowRight size={16} />
            </button>
          )) : <Notice>No Solana wallet detected. Open this page in a browser with Phantom, Solflare or another Solana wallet.</Notice>}
          <a className="lp-link" href="https://phantom.com/download" target="_blank" rel="noreferrer">Get Phantom <ArrowUpRight size={14} /></a>
        </div>
      </dialog>
    </div>
  );
}

/* ---------------- Hyperliquid spotlight ---------------- */
function useHypePrice() {
  const [price, setPrice] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => fetch(`/api/market-data?mode=price&mint=${HYPE}`)
      .then((r) => r.json()).then((d) => { if (active && Number.isFinite(d.usd)) setPrice(d.usd); })
      .catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => { active = false; clearInterval(t); };
  }, []);
  return price;
}

function HypeSpotlight({ compact = false }: { compact?: boolean }) {
  const price = useHypePrice();
  return (
    <section className={`lp-hype ${compact ? 'lp-hype--compact' : ''}`} aria-labelledby="hype-title">
      <div className="lp-hype__mark" aria-hidden="true">H</div>
      <div className="lp-hype__copy">
        <span className="lp-hype__tag"><Zap size={13} /> Featured pair</span>
        <h2 id="hype-title">Launch against HYPE</h2>
        <p>Pair your token with Hyperliquid’s HYPE, bridged to Solana via Wormhole. Traders buy with HYPE, and curve fees accrue in HYPE.</p>
      </div>
      <div className="lp-hype__side">
        <span className="lp-hype__k">HYPE price</span>
        <strong>{price ? `$${price.toLocaleString('en-US', { maximumFractionDigits: price < 1 ? 6 : 2 })}` : '—'}</strong>
        <button className="lp-btn lp-btn--light" onClick={() => go('launch?pair=' + HYPE)}>Launch a HYPE pair <ArrowUpRight size={16} /></button>
      </div>
    </section>
  );
}

/* ---------------- Markets ---------------- */
function Markets({ assets }: { assets: Asset[] }) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  async function refresh() {
    setLoading(true); setError('');
    try { setMarkets(await listMarkets()); } catch (e) { setError(message(e)); } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  const isStock = (m: Market) => assets.some((a) => a.mint === m.quoteMint && a.category === 'stock');
  const filtered = markets.filter((m) =>
    (filter === 'all' || (filter === 'graduated' && m.migrated) || (filter === 'curve' && !m.migrated) ||
      (filter === 'hype' && m.quoteMint === HYPE) || (filter === 'stocks' && isStock(m))) &&
    `${m.name || ''} ${m.symbol || ''} ${m.baseMint}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <section className="lp-hero">
        <div className="lp-hero__copy">
          <span className="lp-eyebrow"><Rocket size={14} /> Moche Launchpad</span>
          <h1>Launch a token.<br /><span>Give it a real market.</span></h1>
          <p>Every launch gets a Meteora bonding curve on Solana. Pair it with HYPE, SOL, USDC or a tokenized stock, then graduate into permanently locked liquidity.</p>
          <div className="lp-row">
            <button className="lp-btn lp-btn--primary" onClick={() => go('launch')}>Launch a token <ArrowUpRight size={18} /></button>
            <a className="lp-btn lp-btn--secondary" href="#how">How it works</a>
          </div>
        </div>
        <img className="lp-hero__art" src="/images/moche-wave-m-440.webp" width="440" height="348" alt="" />
      </section>

      <ul className="lp-facts" role="list">
        <li><Layers size={18} /><span>1B supply<strong>Fixed at launch</strong></span></li>
        <li><ChartNoAxesCombined size={18} /><span>${OPENING_MARKET_CAP_USD.toLocaleString()} → ${GRADUATION_MARKET_CAP_USD.toLocaleString()}<strong>Opening → graduation cap</strong></span></li>
        <li><LockKeyhole size={18} /><span>100% LP locked<strong>On graduation</strong></span></li>
      </ul>

      <HypeSpotlight />

      <div className="lp-head">
        <div><span className="lp-eyebrow">Marketplace</span><h2>Live launches</h2></div>
        <button className="lp-btn lp-btn--ghost lp-btn--sm" onClick={refresh} disabled={loading}><RefreshCw size={15} className={loading ? 'lp-spin' : ''} />Refresh</button>
      </div>
      <div className="lp-toolbar">
        <div className="lp-seg" role="group" aria-label="Filter markets">
          {[['all', 'All'], ['curve', 'On curve'], ['hype', 'HYPE pairs'], ['stocks', 'Stock pairs'], ['graduated', 'Graduated']].map(([v, l]) => (
            <button key={v} aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
        <label className="lp-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or mint" aria-label="Search markets" /></label>
      </div>

      {error ? (
        <div className="lp-empty"><CircleAlert /><h3>Market data is unavailable.</h3><p>{error}</p><button className="lp-btn lp-btn--secondary" onClick={refresh}>Retry</button></div>
      ) : loading ? (
        <div className="lp-empty"><span className="lp-spinner" /><p>Reading launchpad pools from Solana…</p></div>
      ) : filtered.length ? (
        <div className="lp-grid">{filtered.map((m) => <MarketCard key={m.address} market={m} asset={assets.find((a) => a.mint === m.quoteMint)} />)}</div>
      ) : (
        <div className="lp-empty">
          <img src="/images/moche-wave-360.webp" width="96" height="95" alt="" />
          <h3>{search || filter !== 'all' ? 'No matching markets.' : 'No launches yet.'}</h3>
          <p>{markets.length ? 'Try another filter or search.' : 'Be the first to launch a token here.'}</p>
          <button className="lp-btn lp-btn--secondary" onClick={() => go('launch')}>Open launch studio <ArrowRight size={16} /></button>
        </div>
      )}
      <p className="lp-foot"><ShieldCheck size={15} />Listings are read from on-chain pools that use this launchpad’s platform fee wallet. A listing is not an endorsement.</p>
    </>
  );
}

export function MarketCard({ market: m, asset }: { market: Market; asset?: Asset }) {
  const hype = m.quoteMint === HYPE;
  return (
    <button className="lp-card" onClick={() => go('market/' + m.address)}>
      <div className="lp-card__top">
        <TokenArtwork market={m} />
        <div className="lp-card__name">
          <h3>{m.name || short(m.baseMint)}</h3>
          <span>{marketPairLabel(m, asset)}</span>
        </div>
        {hype ? <span className="lp-pill lp-pill--hype">HYPE pair</span> : asset?.category === 'stock' ? <span className="lp-pill">Stock pair</span> : <ArrowUpRight size={18} />}
      </div>
      <div className="lp-card__stats">
        <span>Quote reserve<strong>{format(Number(m.quoteReserve))} {asset?.symbol}</strong></span>
        <span>Stage<strong>{m.migrated ? 'Graduated' : 'Bonding curve'}</strong></span>
      </div>
      <div className="lp-progress" aria-hidden="true"><i style={{ width: `${m.progress * 100}%` }} /></div>
      <div className="lp-card__foot"><span>{m.migrated ? 'Graduated' : 'Curve progress'}</span><b>{(m.progress * 100).toFixed(1)}%</b></div>
    </button>
  );
}

/* ---------------- Pairs ---------------- */
function Pairs({ assets, catalogError }: { assets: Asset[]; catalogError: string }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const stocks = assets.filter((a) => a.category === 'stock' && `${a.name} ${a.symbol}`.toLowerCase().includes(search.toLowerCase()));
  const crypto = assets.filter((a) => a.category === 'crypto');
  return (
    <>
      <PageTitle label="Quote assets" title="Pick the other side of your market." copy="Traders buy your token with the asset you pair it against. HYPE is featured; SOL, USDC and tokenized stocks are available too." />
      <HypeSpotlight compact />
      <h2 className="lp-h2">Crypto pairs</h2>
      <div className="lp-pairs">
        {crypto.map((a) => (
          <article className={`lp-pair ${a.featured ? 'lp-pair--hype' : ''}`} key={a.mint}>
            <AssetIcon asset={a} />
            <div><h3>{a.symbol}</h3><p>{a.name}</p></div>
            {a.featured && <span className="lp-pill lp-pill--hype">Hyperliquid</span>}
            <Address value={a.mint} />
            <button className="lp-btn lp-btn--ghost lp-btn--sm" onClick={() => go('launch?pair=' + a.mint)}>Use as pair <ArrowUpRight size={15} /></button>
          </article>
        ))}
      </div>

      <div className="lp-head">
        <h2 className="lp-h2">{stocks.length} tokenized stocks</h2>
        <label className="lp-search"><Search size={16} /><input placeholder="Search stocks or ETFs" aria-label="Search stocks" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></label>
      </div>
      <Notice>These are tokenized assets from the xStocks issuer, not brokerage shares. Issuer restrictions and regional eligibility apply. Pairing with a stock does not mean your token is backed by it. <a href="https://assets.backed.fi/legal-documentation" target="_blank" rel="noreferrer">Issuer terms</a></Notice>
      {catalogError && <Notice tone="warn">{catalogError}</Notice>}
      <div className="lp-pairs">
        {stocks.slice(page * 24, (page + 1) * 24).map((a) => (
          <article className="lp-pair" key={a.mint}>
            <AssetIcon asset={a} />
            <div><h3>{a.symbol}</h3><p>{a.name}</p></div>
            <span className="lp-pill">xStocks</span>
            <Address value={a.mint} />
            <button className="lp-btn lp-btn--ghost lp-btn--sm" disabled={a.halted} onClick={() => go('launch?pair=' + a.mint)}>{a.halted ? 'Issuer halted' : 'Use as pair'} <ArrowUpRight size={15} /></button>
          </article>
        ))}
      </div>
      {stocks.length > 24 && (
        <div className="lp-pager">
          <button className="lp-btn lp-btn--secondary lp-btn--sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {page + 1} of {Math.ceil(stocks.length / 24)}</span>
          <button className="lp-btn lp-btn--secondary lp-btn--sm" disabled={(page + 1) * 24 >= stocks.length} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </>
  );
}

/* ---------------- Portfolio ---------------- */
function Portfolio({ assets, session, connect }: { assets: Asset[]; session: WalletSession | null; connect: () => void }) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!session) { setMarkets([]); return; }
    setLoading(true);
    listMarkets(session.address === PLATFORM_WALLET ? undefined : session.address)
      .then(setMarkets).catch((e) => setError(message(e))).finally(() => setLoading(false));
  }, [session?.address]);
  return (
    <>
      <PageTitle label="My activity" title="Your launches and fees." copy="Markets you created, read directly from Solana. Connect the wallet you launched with to claim earned fees." />
      {!session ? (
        <div className="lp-empty">
          <span className="lp-ic"><Wallet size={22} /></span>
          <h3>Connect your wallet to see your launches.</h3>
          <button className="lp-btn lp-btn--primary" onClick={connect}>Connect wallet</button>
        </div>
      ) : (
        <>
          <div className="lp-panel lp-head">
            <div><span className="lp-eyebrow">Connected wallet</span><h3><Address value={session.address} /></h3></div>
            <span className="lp-pill">{session.address === PLATFORM_WALLET ? 'Platform wallet' : 'Creator'}</span>
          </div>
          {error ? <Notice tone="warn">{error}</Notice>
            : loading ? <div className="lp-empty"><span className="lp-spinner" />Loading your markets…</div>
            : markets.length ? <div className="lp-grid">{markets.map((m) => <MarketCard key={m.address} market={m} asset={assets.find((a) => a.mint === m.quoteMint)} />)}</div>
            : <div className="lp-empty"><img src="/images/moche-wave-360.webp" width="96" height="95" alt="" /><h3>No launches found for this wallet.</h3><button className="lp-btn lp-btn--secondary" onClick={() => go('launch')}>Launch your first token</button></div>}
        </>
      )}
    </>
  );
}

/* ---------------- How it works ---------------- */
function HowItWorks() {
  return (
    <>
      <PageTitle label="How it works" title="From idea to liquidity." copy="The Moche Launchpad runs on Meteora’s audited on-chain programs. You approve every step in your own wallet." />
      <div className="lp-two">
        <article className="lp-panel">
          <ol className="lp-steps">
            <li><b>1</b><div><h3>Create your token</h3><p>Name, ticker, image and pair. Your token, its curve configuration and its market are created together in one transaction.</p></div></li>
            <li><b>2</b><div><h3>Trade on the curve</h3><p>Buys and sells move the price along a Meteora bonding curve. Opening market cap is ${OPENING_MARKET_CAP_USD.toLocaleString()}.</p></div></li>
            <li><b>3</b><div><h3>Graduate</h3><p>At a ${GRADUATION_MARKET_CAP_USD.toLocaleString()} market cap the pool can migrate to Meteora DAMM v2. The liquidity is permanently locked.</p></div></li>
          </ol>
        </article>
        <article className="lp-panel">
          <h2>Where fees go</h2>
          <p>You choose a 1%, 2% or 3% trading fee. After Meteora’s protocol fee, curve fees are split evenly:</p>
          <div className="lp-split"><span>Creator · 50%</span><span>Platform · 50%</span></div>
          <p>After graduation, the locked liquidity is attributed 50/50 to the creator and the platform, and both can claim their LP fees. The DAMM v2 base fee is 1%.</p>
          <dl className="lp-dl">
            <div><dt>Supply</dt><dd>1,000,000,000 · 6 decimals</dd></div>
            <div><dt>Mint &amp; freeze authority</dt><dd>Revoked</dd></div>
            <div><dt>Pairs</dt><dd>HYPE, SOL, USDC, tokenized stocks</dd></div>
            <div><dt>Network</dt><dd>Solana mainnet</dd></div>
          </dl>
        </article>
      </div>
      <Notice>Launching and trading tokens is risky. Prices can fall to zero and liquidity can be thin. Nothing here is financial advice. usemoche never asks for your seed phrase or private key. <a href="https://docs.meteora.ag" target="_blank" rel="noreferrer">Meteora documentation</a></Notice>
    </>
  );
}

function PendingTransaction() {
  const [cleared, setCleared] = useState(false);
  let pending: { signature: string } | null = null;
  try { pending = JSON.parse(localStorage.getItem('usemoche.pending') || 'null'); } catch { return null; }
  if (!pending || cleared) return null;
  return (
    <Notice tone="warn">
      A previous transaction needs a status check. <a href={`https://solscan.io/tx/${pending.signature}`} target="_blank" rel="noreferrer">View transaction</a>{' '}
      <button className="lp-btn lp-btn--ghost lp-btn--sm" onClick={() => { localStorage.removeItem('usemoche.pending'); setCleared(true); }}>I checked it — clear</button>
    </Notice>
  );
}

