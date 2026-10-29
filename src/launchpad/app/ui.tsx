import { useState, type ReactNode } from 'react';
import { CircleAlert, ExternalLink, Check, Copy } from 'lucide-react';
import { short, type Market, type WalletSession } from './chain';
import type { Asset } from '../lib/constants';
import { safeUrl } from '../lib/validation';

export const format = (n: number) =>
  Intl.NumberFormat('en', { maximumFractionDigits: 5, notation: n > 100000 ? 'compact' : 'standard' }).format(n);

export const go = (route: string) => {
  location.hash = route;
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

export function message(e: unknown) {
  const text = e instanceof Error ? e.message : '';
  if (!text) return 'Something went wrong. Please try again.';
  if (/Mainnet RPC unavailable|failed to fetch|Failed to fetch|503 Service Unavailable|429/i.test(text))
    return 'Can’t reach Solana right now. Please retry in a moment.';
  if (/User rejected|rejected the request|declined/i.test(text)) return 'You declined the request in your wallet. Nothing was sent.';
  return text.length > 220 ? text.slice(0, 217) + '…' : text;
}

export function safeHref(s: string) {
  try { return safeUrl(s); } catch { return undefined; }
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div className={`lp-notice lp-notice--${tone}`} role="status">
      <CircleAlert size={18} />
      <div>{children}</div>
    </div>
  );
}

export function Address({ value }: { value: string }) {
  return (
    <a className="lp-addr" href={`https://solscan.io/account/${value}`} target="_blank" rel="noreferrer">
      {short(value)} <ExternalLink size={12} />
    </a>
  );
}

export function AssetIcon({ asset }: { asset: Asset }) {
  if (asset.featured === 'hyperliquid') return <span className="lp-asset-ic lp-asset-ic--hype" aria-hidden="true">H</span>;
  return asset.logo ? (
    <img className="lp-asset-ic" src={asset.logo} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
  ) : (
    <span className="lp-asset-ic lp-asset-ic--letter" aria-hidden="true">{asset.symbol.slice(0, 1)}</span>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="lp-field">
      <span className="lp-field__label">{label}</span>
      {children}
      {hint && <small className="lp-field__hint">{hint}</small>}
    </label>
  );
}

export function PageTitle({ label, title, copy, children }: { label: string; title: string; copy: string; children?: ReactNode }) {
  return (
    <section className="lp-title">
      <span className="lp-eyebrow">{label}</span>
      <h1>{title}</h1>
      <p>{copy}</p>
      {children}
    </section>
  );
}

export function CopyInline({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(value); setState('Copied'); }
    catch { setState('Select to copy'); }
    window.setTimeout(() => setState(''), 1800);
  }
  return (
    <button type="button" className="lp-copy" onClick={copy} aria-label={label}>
      {state === 'Copied' ? <Check size={14} /> : <Copy size={14} />}
      <span>{state || 'Copy'}</span>
    </button>
  );
}

export type ActionProps = {
  session: WalletSession | null;
  connect: () => void;
  action: (fn: () => Promise<string | void>) => Promise<void>;
  busy: boolean;
  setStatus: (s: string) => void;
};

export function marketPairLabel(m: Market, asset?: Asset) {
  return `${m.symbol || 'TOKEN'} / ${asset?.symbol || short(m.quoteMint)}`;
}
