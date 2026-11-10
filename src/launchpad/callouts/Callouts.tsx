import { useEffect, useRef, useState } from 'react';
import { getWallets } from '@wallet-standard/app';
import bs58 from 'bs58';
import { Megaphone, Wallet, RefreshCw, ExternalLink, CircleAlert, Check, X, ArrowRight, Trash2, ShieldCheck } from 'lucide-react';
import { Notice, PageTitle } from '../app/ui';
import { readApiJson } from '../lib/http';
import { CALLOUT_CHAINS, CALLOUT_MAX, calloutMessage, deleteMessage, validToken, type Callout, type CalloutChain } from './shared';
import { EVM_CHAINS } from '../evm/chains';

const CHAIN_NAME: Record<CalloutChain, string> = { solana: 'Solana', elysium: 'Elysium', robinhood: 'Robinhood Chain' };
const short = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);
const MOD = 'C1rdVXhfUe3RDNxMFrGYSHN6MpkhjTLhVaBk3ZpMJWnT';

function tokenLink(p: Callout) {
  if (p.chain === 'solana') return { href: `https://solscan.io/token/${p.token}`, label: 'Solscan' };
  return { href: `/launchpad?chain=${p.chain}#market/${p.token}`, label: 'MochePad', internal: true, explorer: `${EVM_CHAINS[p.chain].explorer}/address/${p.token}` };
}
function ago(t: number) {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.round(s / 60)}m ago`; if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type SolSession = { wallet: any; account: any; address: string };

export function Callouts({ defaultChain = 'solana' }: { defaultChain?: CalloutChain }) {
  const [posts, setPosts] = useState<Callout[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [minHolding, setMinHolding] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | CalloutChain>('all');
  const [session, setSession] = useState<SolSession | null>(null);
  const [wallets, setWallets] = useState<readonly any[]>([]);
  const [picker, setPicker] = useState(false);
  const [chain, setChain] = useState<CalloutChain>(defaultChain);
  const [token, setToken] = useState(() => new URLSearchParams(location.hash.split('?')[1]).get('token') || '');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);

  async function load() {
    setLoading(true); setError('');
    try {
      const d = await readApiJson(await fetch('/api/callouts'), 'Callouts');
      setEnabled(!!d.enabled); setMinHolding(Number(d.minHolding) || 0); setPosts(Array.isArray(d.posts) ? d.posts : []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Callouts are unavailable.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const w = getWallets();
    const update = () => setWallets(w.get().filter((x) => x.chains.includes('solana:mainnet') && 'solana:signMessage' in x.features));
    update(); const a = w.on('register', update), b = w.on('unregister', update);
    return () => { a(); b(); };
  }, []);
  useEffect(() => { if (picker) dialog.current?.showModal(); else dialog.current?.close(); }, [picker]);

  async function connect(wallet: any) {
    try {
      const r = await wallet.features['standard:connect'].connect();
      const account = r.accounts.find((a: any) => a.chains.includes('solana:mainnet'));
      if (!account) throw new Error('Enable Solana mainnet in this wallet.');
      setSession({ wallet, account, address: account.address }); setPicker(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Wallet connection failed.'); }
  }
  async function sign(message: string) {
    const [out] = await session!.wallet.features['solana:signMessage'].signMessage({ account: session!.account, message: new TextEncoder().encode(message) });
    return bs58.encode(out.signature);
  }

  async function post() {
    setError(''); setNotice('');
    const clean = text.replace(/\r\n?/g, '\n').trim(), addr = token.trim();
    if (!validToken(chain, addr)) return setError(`Enter a valid ${CHAIN_NAME[chain]} token address.`);
    if (!clean) return setError('Write your callout first.');
    if (!session) return setPicker(true);
    setBusy(true);
    try {
      const time = Date.now();
      const signature = await sign(calloutMessage({ chain, token: addr, time, text: clean }));
      const d = await readApiJson(await fetch('/api/callouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet: session.address, chain, token: addr, text: clean, time, signature }) }), 'Callout');
      setPosts((p) => [d.post, ...p]); setText(''); setNotice('Callout posted.');
    } catch (e: any) {
      setError(/reject|declin/i.test(String(e?.message)) ? 'You declined the signature. Nothing was posted.' : e instanceof Error ? e.message : 'Posting failed.');
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!session) return;
    try {
      const time = Date.now();
      const signature = await sign(deleteMessage(id, time));
      await readApiJson(await fetch('/api/callouts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet: session.address, id, time, signature }) }), 'Remove callout');
      setPosts((p) => p.filter((x) => x.id !== id));
    } catch (e) { setError(e instanceof Error ? e.message : 'Removing failed.'); }
  }

  const shown = posts.filter((p) => filter === 'all' || p.chain === filter);
  const left = CALLOUT_MAX - [...text].length;
  return (
    <>
      <PageTitle label="Callouts" title="Calls from $MOCHE holders." copy="Holders post the tokens they’re watching on Solana, Elysium and Robinhood Chain. Every callout is signed by the poster’s wallet. Callouts are opinions, not advice." />

      <section className="lp-panel lp-callout-form" aria-label="Post a callout">
        <div className="lp-head lp-head--tight">
          <h2 className="lp-h2" style={{ margin: 0 }}><Megaphone size={18} /> Post a callout</h2>
          {session ? <button className="lp-btn lp-btn--ghost lp-btn--sm" onClick={() => setSession(null)}>{short(session.address)} <X size={14} /></button>
            : <button className="lp-btn lp-btn--secondary lp-btn--sm" onClick={() => setPicker(true)}><Wallet size={15} /> Connect Solana wallet</button>}
        </div>
        {!enabled ? <Notice>Posting opens soon. You can already read callouts here once they start.</Notice> : (
          <>
            <div className="lp-seg" role="group" aria-label="Token chain">
              {CALLOUT_CHAINS.map((c) => <button key={c} aria-pressed={chain === c} onClick={() => setChain(c)}>{CHAIN_NAME[c]}</button>)}
            </div>
            <label className="lp-field"><span className="lp-field__label">Token address</span>
              <input value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder={chain === 'solana' ? 'Solana mint address' : '0x…'} spellCheck={false} /></label>
            <label className="lp-field"><span className="lp-field__label">Your call</span>
              <textarea rows={3} value={text} maxLength={CALLOUT_MAX * 2} onChange={(e) => setText(e.target.value)} placeholder="Why you’re watching it, in your own words." />
              <small className={`lp-field__hint ${left < 0 ? 'lp-over' : ''}`}>{left} characters left · one callout every 10 minutes</small></label>
            {error && <Notice tone="warn">{error}</Notice>}
            {notice && <p className="lp-ok"><Check size={15} />{notice}</p>}
            <div className="lp-row">
              <button className="lp-btn lp-btn--primary" onClick={post} disabled={busy || left < 0}>{busy ? 'Signing…' : session ? 'Sign & post' : 'Connect to post'} <ArrowRight size={16} /></button>
              <p className="lp-help" style={{ flex: 1 }}><ShieldCheck size={14} /> Posting needs {minHolding ? `${minHolding.toLocaleString('en-US')} $MOCHE` : '$MOCHE'} in your Solana wallet. Signing a message is free and sends no transaction.</p>
            </div>
          </>
        )}
      </section>

      <div className="lp-head">
        <div><span className="lp-eyebrow">Feed</span><h2>Latest callouts</h2></div>
        <button className="lp-btn lp-btn--ghost lp-btn--sm" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? 'lp-spin' : ''} />Refresh</button>
      </div>
      <div className="lp-seg" role="group" aria-label="Filter callouts">
        {(['all', ...CALLOUT_CHAINS] as const).map((c) => <button key={c} aria-pressed={filter === c} onClick={() => setFilter(c)}>{c === 'all' ? 'All chains' : CHAIN_NAME[c]}</button>)}
      </div>
      {loading ? <div className="lp-empty"><span className="lp-spinner" /><p>Loading callouts…</p></div>
        : error && !posts.length ? <div className="lp-empty"><CircleAlert /><h3>Callouts are unavailable.</h3><button className="lp-btn lp-btn--secondary" onClick={load}>Retry</button></div>
        : shown.length ? (
          <ul className="lp-callouts" role="list">
            {shown.map((p) => {
              const l = tokenLink(p);
              return (
                <li key={p.id} className="lp-panel lp-callout">
                  <div className="lp-callout__meta">
                    <a className="lp-addr" href={`https://solscan.io/account/${p.wallet}`} target="_blank" rel="noreferrer">{short(p.wallet)} <ExternalLink size={12} /></a>
                    <span className="lp-pill">{CHAIN_NAME[p.chain]}</span>
                    <span className="lp-muted">{p.holding.toLocaleString('en-US', { notation: 'compact' })} $MOCHE · {ago(p.time)}</span>
                    {session && session.address === MOD && <button className="lp-btn lp-btn--ghost lp-btn--sm" aria-label="Remove callout" onClick={() => remove(p.id)}><Trash2 size={14} /></button>}
                  </div>
                  <p className="lp-callout__text">{p.text}</p>
                  <div className="lp-row">
                    <code className="lp-callout__token">{short(p.token)}</code>
                    <a className="lp-link" href={l.href} target={l.internal ? undefined : '_blank'} rel="noreferrer">View on {l.label} <ExternalLink size={12} /></a>
                    {l.explorer && <a className="lp-link" href={l.explorer} target="_blank" rel="noreferrer">Explorer <ExternalLink size={12} /></a>}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <div className="lp-empty"><img src="/images/moche-wave-360.webp" width="96" height="95" alt="" /><h3>No callouts yet.</h3><p>{enabled ? 'Be the first to post one.' : 'Callouts open soon.'}</p></div>}
      <p className="lp-foot"><ShieldCheck size={15} />Callouts are posted by holders, not by usemoche. Always check a token yourself before buying.</p>

      <dialog ref={dialog} onCancel={() => setPicker(false)} onClick={(e) => { if (e.target === dialog.current) setPicker(false); }} className="lp-wallets" aria-labelledby="lp-co-wallets">
        <div className="lp-wallets__panel">
          <button className="lp-wallets__close" onClick={() => setPicker(false)} aria-label="Close wallet selection"><X size={18} /></button>
          <span className="lp-ic lp-ic--solid"><Wallet size={22} /></span>
          <h2 id="lp-co-wallets">Connect the wallet holding $MOCHE</h2>
          <p>You’ll sign a short message to post. It’s free and sends no transaction.</p>
          {wallets.length ? wallets.map((w) => <button className="lp-wallet" key={w.name} onClick={() => connect(w)}><img src={w.icon} alt="" />{w.name}<ArrowRight size={16} /></button>)
            : <Notice>No Solana wallet with message signing detected. Open this page with Phantom, Solflare or Backpack.</Notice>}
        </div>
      </dialog>
    </>
  );
}
