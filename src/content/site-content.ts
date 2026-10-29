/**
 * Marketing copy & illustrative demo content.
 * Illustrative content is clearly labelled in the UI and never
 * represents a real analysis, a real wallet, or live data.
 */
import { brand, copyTradingAccess, formatNumber, supportedNetworks, links } from '../config/site';

export const nav = [
  { id: 'home', label: 'Home', short: 'Home', href: '/', icon: 'home' },
  { id: 'products', label: 'Products', short: 'Tools', href: '/products/', icon: 'grid' },
  { id: 'copy', label: 'Copy Trading', short: 'Copy', href: '/copy-trading/', icon: 'users' },
  { id: 'launchpad', label: 'Launchpad', short: 'Launch', href: '/launchpad/', icon: 'rocket' },
  { id: 'moche', label: '$MOCHE', short: 'MOCHE', href: '/moche/', icon: 'coins' },
] as const;

export type NavId = (typeof nav)[number]['id'];

const holding = formatNumber(copyTradingAccess.minimumHolding);

export const products = [
  {
    id: 'signal',
    name: 'Signal Bot',
    icon: 'signal',
    command: brand.commands.signal,
    short: 'Get a Buy / Sell / Wait read on a token, right in the replies.',
    summary: 'Reply under a token post and get a Buy / Sell / Wait assessment with reasons.',
    href: '/products/#signal',
  },
  {
    id: 'check',
    name: 'Token & Wallet Check',
    icon: 'shield',
    command: brand.commands.check,
    short: 'Check token safety, wallet activity and key risk indicators.',
    summary: 'Estimate token risk and research wallet activity, with the evidence behind it.',
    href: '/products/#check',
  },
  {
    id: 'copy',
    name: 'KOL Copy Trading',
    icon: 'users',
    badge: { tone: 'holder', text: 'Hold 10M MOCHE for free access' },
    short: 'Follow top KOLs and explore their on-chain moves.',
    summary: 'Follow selected KOL and whale wallets, and copy them within limits you set.',
    href: '/copy-trading/',
  },
  {
    id: 'launchpad',
    name: 'Moche Launchpad',
    icon: 'rocket',
    badge: { tone: 'live', text: 'Live' },
    short: 'Launch a Solana token in one transaction. HYPE pairs featured.',
    summary: 'Launch a Solana token with a real bonding curve. Pair it with HYPE, SOL, USDC or a tokenized stock.',
    href: '/launchpad/',
  },
] as const;

/** Illustrative command previews (Home + Products). */
export const previews = {
  signal: {
    command: brand.commands.signal,
    caption: 'Reply under a post about a token',
    assessment: 'Wait',
    confidence: 'Medium',
    reasons: [
      'Momentum is building, but volume is uneven across recent sessions.',
      'Price is close to a level where it has stalled before.',
      'Holder growth is steady, without a clear breakout signal yet.',
    ],
    risk: 'Small-cap token. Price can move sharply in either direction.',
  },
  check: {
    command: brand.commands.check,
    caption: 'Reply under a post about a token or project',
    riskEstimate: 'Moderate',
    confidence: 'High',
    rows: [
      { label: 'Token permissions', status: 'ok', note: 'No unusual permissions found' },
      { label: 'Holder concentration', status: 'warn', note: 'A few wallets hold a large share' },
      { label: 'Liquidity', status: 'ok', note: 'No liquidity red flags found' },
      { label: 'Wallet activity', status: 'warn', note: 'Recent large transfers to exchanges' },
    ],
  },
} as const;

export const howItWorks = [
  {
    title: 'Find a post about a token',
    body: 'Any post on X that mentions the token or project you want to look into.',
  },
  {
    title: 'Reply with a command',
    body: `Mention ${brand.xHandle} with signal or check in your reply.`,
  },
  {
    title: 'Get an analysis in the thread',
    body: 'Moche replies with context. If it can’t tell which token you mean, it asks for the contract address.',
  },
];

const networksAnswer =
  supportedNetworks.length > 0
    ? `Currently supported: ${supportedNetworks.join(', ')}.`
    : 'Supported networks haven’t been confirmed yet. This answer will be updated when the team announces them.';

export const faq = [
  {
    q: 'What is usemoche?',
    a: `usemoche is a set of crypto research tools with a friendly face, Moche. You mention ${brand.xHandle} under a post on X with a command, and Moche replies with analysis. It also includes KOL wallet copy trading and the Moche Launchpad for creating Solana tokens.`,
  },
  {
    q: 'How do I request a signal?',
    a: `Find a post about a token, reply with “${brand.commands.signal}”, and Moche responds with a Buy / Sell / Wait assessment, its reasons, a confidence level and risk context. Signals are research. They don’t execute trades and they aren’t guaranteed.`,
  },
  {
    q: 'How do token checks work?',
    a: `Reply with “${brand.commands.check}” under a post about a token or project. Moche looks at token permissions, holder concentration, liquidity-related risks and relevant wallet activity, then gives a risk estimate, a separate confidence level, and the key concerns with supporting evidence. Check also supports wallet research. The exact wallet input flow is still being finalised.`,
  },
  {
    q: 'Does a low-risk result guarantee safety?',
    a: 'No. A risk level is an estimate based on what can be observed at that moment. Conditions change, and some risks can’t be detected on-chain. Always do your own research and only risk what you can afford to lose.',
  },
  {
    q: 'Who gets free copy trading access?',
    a: `Anyone holding at least ${holding} ${brand.token} gets free access to KOL wallet copy trading. It’s a holding requirement. It isn’t a subscription price and it doesn’t require staking.`,
  },
  {
    q: 'Is the launchpad available?',
    a: 'Yes. The Moche Launchpad is live on Solana mainnet. Every token has a 1B supply and opens on a Meteora bonding curve at a $4,000 market cap, then graduates at $35,000 into permanently locked liquidity. You can pair it with HYPE, SOL, USDC or a tokenized stock, and choose a 1–3% trading fee split 50/50 between creator and platform.',
  },
  {
    q: 'Which networks are supported?',
    a: networksAnswer,
  },
];

export const footerLinks = [
  { label: 'X', href: links.x },
  { label: 'Documentation', href: links.docs },
  { label: 'Support', href: links.support },
  { label: 'Terms', href: links.terms },
  { label: 'Privacy', href: links.privacy },
];

export const disclaimer =
  'usemoche provides research tools, not financial advice. Signals and risk estimates can be wrong. Crypto assets are volatile; never invest more than you can afford to lose. We will never ask for your seed phrase or private key.';
