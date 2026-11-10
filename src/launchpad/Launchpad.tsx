import { Buffer } from 'buffer';
(globalThis as any).Buffer ??= Buffer;
import { lazy, Suspense, useState } from 'react';
import App from './app/App';
import { CHAIN_TABS, readChainFromUrl, type ChainKey } from './evm/chains';
import './launchpad.css';
import './multichain.css';

const EvmApp = lazy(() => import('./evm/EvmApp'));

/** Client-only island mounted on /launchpad. Solana is the default; ?chain=elysium|robinhood switches. */
export default function Launchpad() {
  const [chain, setChain] = useState<ChainKey>(readChainFromUrl);
  function pick(next: ChainKey) {
    if (next === chain) return;
    const url = new URL(location.href);
    if (next === 'solana') url.searchParams.delete('chain'); else url.searchParams.set('chain', next);
    const keep = ['callouts', 'how'].includes(location.hash.slice(1).split('?')[0]) ? location.hash : '#markets';
    url.hash = keep;
    history.pushState(null, '', url);
    setChain(next);
  }
  return (
    <>
      <div className="lp-chains" role="tablist" aria-label="Choose a chain">
        <span className="lp-chains__label">MochePad</span>
        {CHAIN_TABS.map((c) => (
          <button key={c.key} role="tab" aria-selected={chain === c.key} className={`lp-chain lp-chain--${c.key}`} onClick={() => pick(c.key)}>
            <i aria-hidden="true" /><span><strong>{c.name}</strong><small>{c.native}</small></span>
            {c.key === 'elysium' && <em>New</em>}
          </button>
        ))}
      </div>
      {chain === 'solana' ? <App key="solana" /> : (
        <Suspense fallback={<div className="lp-empty"><span className="lp-spinner" /><p>Loading…</p></div>}>
          <EvmApp key={chain} chainKey={chain} />
        </Suspense>
      )}
    </>
  );
}
