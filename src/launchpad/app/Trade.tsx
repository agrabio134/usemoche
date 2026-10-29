import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ArrowLeft, Wallet, RefreshCw, Rocket } from 'lucide-react';
import { HYPE, PLATFORM_WALLET, type Asset } from '../lib/constants';
import { loadMarket, prepareSwap, submit, claimFees, migratePool, claimLpFees, short, tokenBalance, type Market } from './chain';
import { TokenArtwork, ContractAddress, TokenMarketDetails } from './TokenDetails';
import { MarketChart } from './MarketChart';
import { useLiveQuote } from './useLiveQuote';
import { Address, Field, Notice, format, message, type ActionProps } from './ui';

export function Trade({ address, assets, session, connect, action, busy, setStatus }: ActionProps & { address: string; assets: Asset[] }) {
  const [market, setMarket] = useState<Market | null>(null);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('');
  const [sell, setSell] = useState(false);
  const [slippage, setSlippage] = useState('1');
  const [balance, setBalance] = useState('—');
  const [eligible, setEligible] = useState(false);
  const asset = assets.find((a) => a.mint === market?.quoteMint);
  const quoteSymbol = asset?.symbol || (market ? short(market.quoteMint) : '');
  const refreshId = useRef(0);

  async function refresh() {
    const id = ++refreshId.current;
    try { const next = await loadMarket(address); if (refreshId.current === id) { setMarket(next); setError(''); } }
    catch (e) { if (refreshId.current === id) setError(message(e)); }
  }
  useEffect(() => { setMarket(null); refresh(); const i = setInterval(refresh, 10000); return () => { refreshId.current++; clearInterval(i); }; }, [address]);
  useEffect(() => {
    let active = true;
    if (session && market) tokenBalance(session.address, sell ? market.baseMint : market.quoteMint).then((v) => { if (active) setBalance(v); }).catch(() => { if (active) setBalance('Unavailable'); });
    else setBalance('—');
    return () => { active = false; };
  }, [sell, session?.address, market?.address, market?.observedAt]);

  const requestKey = JSON.stringify([address, amount, sell, slippage, session?.address, asset?.mint, market?.migrated]);
  const validAmount = /^\d+(\.\d+)?$/.test(amount) && Number(amount) > 0;
  const { quote, error: quoteError, refreshing: quoting } = useLiveQuote({
    requestKey,
    enabled: !!session && !!market && !!asset && validAmount && !busy,
    fetchQuote: () => prepareSwap(market!, asset!, amount, sell, Math.round(Number(slippage) * 100), session!.address),
  });
  const quoteFresh = !!quote && Date.now() - quote.created < 20000;

  if (!market) return (
    <div className="lp-empty">{error ? <Notice tone="warn">{error}</Notice> : <><span className="lp-spinner" />Reading market…</>}
      <a className="lp-link" href="#markets"><ArrowLeft size={15} />All markets</a></div>
  );

  return (
    <>
      <a className="lp-back" href="#markets"><ArrowLeft size={15} />All markets</a>
      <div className="lp-token">
        <TokenArtwork market={market} large />
        <div className="lp-token__id">
          <span className="lp-eyebrow">{market.migrated ? 'Graduated · Meteora DAMM v2' : 'Bonding curve'}</span>
          <h1>{market.name || short(market.baseMint)} <small>${market.symbol}</small></h1>
          <ContractAddress value={market.baseMint} />
        </div>
        <span className={`lp-pill ${market.quoteMint === HYPE ? 'lp-pill--hype' : ''}`}>{quoteSymbol} pair</span>
      </div>
      <TokenMarketDetails market={market} quoteSymbol={quoteSymbol} />

      <div className="lp-trade">
        <div className="lp-trade__left">
          <MarketChart market={market} quoteSymbol={quoteSymbol} />
          <section className="lp-panel">
            <div className="lp-head"><h2>Market</h2><button className="lp-btn lp-btn--ghost lp-btn--sm" onClick={refresh}><RefreshCw size={15} />Refresh</button></div>
            <div className="lp-stats">
              <div><span>{market.migrated ? 'Pool price' : 'Curve price'}</span><strong>{market.price > 0 && market.price < 0.00001 ? market.price.toExponential(4) : format(market.price)} <small>{quoteSymbol}</small></strong></div>
              <div><span>Market cap</span><strong>{format(market.price * market.supply)} <small>{quoteSymbol}</small></strong></div>
              <div><span>Quote reserve</span><strong>{format(Number(market.quoteReserve))} <small>{quoteSymbol}</small></strong></div>
              <div><span>Unclaimed curve fees</span><strong>{format(Number(market.fees))} <small>{quoteSymbol}</small></strong></div>
            </div>
            <div className="lp-grad">
              <Rocket size={22} />
              <div>
                <h3>{market.migrated ? 'Graduated to locked liquidity' : market.progress >= 1 ? 'Ready to migrate' : 'Heading for graduation'}</h3>
                <div className="lp-progress"><i style={{ width: `${market.progress * 100}%` }} /></div>
                <p><b>{(market.progress * 100).toFixed(2)}%</b> · graduation market cap {format(market.graduationCap)} {quoteSymbol}</p>
              </div>
            </div>
            {session && !market.migrated && market.progress >= 1 && (
              <button className="lp-btn lp-btn--secondary" disabled={busy} onClick={() => action(async () => { const sig = await migratePool(market, session, setStatus); refresh(); return sig; })}>Complete migration to DAMM v2 <ArrowUpRight size={16} /></button>
            )}
          </section>
          <section className="lp-panel">
            <h2>On-chain details</h2>
            <dl className="lp-dl">
              <div><dt>Token</dt><dd><Address value={market.baseMint} /></dd></div>
              <div><dt>Pair token</dt><dd><Address value={market.quoteMint} /></dd></div>
              <div><dt>Trading pool</dt><dd><Address value={market.tradingPool} /></dd></div>
              <div><dt>Curve pool</dt><dd><Address value={market.address} /></dd></div>
              <div><dt>Creator</dt><dd><Address value={market.creator} /></dd></div>
              <div><dt>Curve config</dt><dd><Address value={market.config} /></dd></div>
            </dl>
            <div className="lp-row">
              {session && (session.address === market.creator || session.address === PLATFORM_WALLET) && (
                <button className="lp-btn lp-btn--secondary lp-btn--sm" disabled={busy} onClick={() => action(async () => claimFees(market, session, setStatus))}>Claim {session.address === PLATFORM_WALLET ? 'platform' : 'creator'} curve fees <ArrowUpRight size={15} /></button>
              )}
              {session && market.migrated && (
                <button className="lp-btn lp-btn--secondary lp-btn--sm" disabled={busy} onClick={() => action(async () => claimLpFees(market, session, setStatus))}>Claim LP fees <ArrowUpRight size={15} /></button>
              )}
            </div>
          </section>
        </div>

        <section className="lp-panel lp-swap" aria-label="Swap">
          <div className="lp-seg lp-seg--full" role="group" aria-label="Side">
            <button aria-pressed={!sell} onClick={() => setSell(false)}>Buy</button>
            <button aria-pressed={sell} onClick={() => setSell(true)}>Sell</button>
          </div>
          {(error || quoteError) && <Notice tone="warn">{error || quoteError}</Notice>}
          <Field label={`You pay (${sell ? market.symbol || 'TOKEN' : quoteSymbol})`}>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </Field>
          <p className="lp-balance">Balance: {balance} {asset?.category === 'stock' && !sell ? '(raw units)' : ''}</p>
          <Field label="Slippage (%)" hint="0.1%–5%. Quotes refresh automatically.">
            <input inputMode="decimal" value={slippage} onChange={(e) => setSlippage(e.target.value)} />
          </Field>
          {asset?.category === 'stock' && (
            <>
              <Notice>Amounts are raw on-chain units, before the issuer’s display multiplier. Issuer eligibility rules apply.</Notice>
              <label className="lp-check"><input type="checkbox" checked={eligible} onChange={(e) => setEligible(e.target.checked)} /><span>I’m eligible under the issuer’s terms.</span></label>
            </>
          )}
          <div className="lp-quote" aria-live="polite">
            <span>You receive (est.)<strong>{quote ? quote.out : '—'} {sell ? quoteSymbol : market.symbol || 'TOKEN'}</strong></span>
            <span>Minimum<strong>{quote ? quote.minimum : '—'}</strong></span>
            <span>Route<strong>{quote?.route || (market.migrated ? 'Meteora DAMM v2' : 'Meteora bonding curve')}</strong></span>
            <small>{quoting ? (quote ? 'Refreshing…' : 'Calculating…') : quoteFresh ? 'Live quote' : validAmount ? (session ? 'Waiting for a quote' : 'Connect a wallet for a live quote') : 'Enter an amount'}</small>
          </div>
          {!session ? (
            <button className="lp-btn lp-btn--primary lp-btn--block" onClick={connect}>Connect wallet <Wallet size={16} /></button>
          ) : (
            <button className="lp-btn lp-btn--primary lp-btn--block" disabled={busy || !quoteFresh || (asset?.category === 'stock' && !eligible)} onClick={() => {
              const selected = quote; if (!selected) return;
              action(async () => {
                if (Date.now() - selected.created > 20000) throw new Error('The quote is refreshing. Try again in a moment.');
                const sig = await submit(selected.tx, [], session, setStatus); setAmount(''); refresh(); return sig;
              });
            }}>{busy ? 'Reviewing…' : sell ? `Sell ${market.symbol || 'token'}` : `Buy ${market.symbol || 'token'}`}<ArrowUpRight size={16} /></button>
          )}
          <p className="lp-help">Every swap is simulated before you sign. A quote is an estimate, not a guarantee.</p>
        </section>
      </div>
    </>
  );
}
