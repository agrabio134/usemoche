import { createPublicKey, verify } from 'node:crypto';
import bs58 from 'bs58';
import { list, put, del } from '@vercel/blob';
import { serverEnv } from './env';
import { CALLOUT_CHAINS, CALLOUT_MAX, CALLOUT_MIN_MOCHE, calloutMessage, deleteMessage, validToken, type Callout, type CalloutChain } from '../callouts/shared';

const MOCHE_MINT = '2C5DqjLHvJbxdf5c2o99KB8PScyt3XUtykmXHYuGmeme';
const COOLDOWN_MS = 10 * 60 * 1000;
const MAX_SKEW_MS = 5 * 60 * 1000;
const PREFIX = 'callouts/posts/';
let feedCache: { at: number; posts: Callout[] } | null = null;

const token = () => serverEnv('BLOB_READ_WRITE_TOKEN');
const minHolding = () => { const v = Number(serverEnv('CALLOUTS_MIN_MOCHE')); return Number.isFinite(v) && v >= 0 ? v : CALLOUT_MIN_MOCHE; };
// The platform fee wallet moderates by default; CALLOUTS_ADMINS (comma-separated) replaces it.
const admins = () => (serverEnv('CALLOUTS_ADMINS') || 'C1rdVXhfUe3RDNxMFrGYSHN6MpkhjTLhVaBk3ZpMJWnT').split(',').map((s) => s.trim()).filter(Boolean);

function verifySolana(wallet: string, message: string, signature: string) {
  try {
    const pub = bs58.decode(wallet), sig = bs58.decode(signature);
    if (pub.length !== 32 || sig.length !== 64) return false;
    const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(pub)]), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(message, 'utf8'), key, Buffer.from(sig));
  } catch { return false; }
}

async function mocheBalance(wallet: string) {
  const endpoint = serverEnv('MAINNET_RPC_URL') || 'https://api.mainnet-beta.solana.com';
  const r = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner', params: [wallet, { mint: MOCHE_MINT }, { encoding: 'jsonParsed', commitment: 'confirmed' }] }),
  });
  if (!r.ok) throw new Error('rpc');
  const d = await r.json();
  if (!Array.isArray(d?.result?.value)) throw new Error('rpc');
  return d.result.value.reduce((sum: number, a: any) => sum + Number(a?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0), 0);
}

async function feed(): Promise<Callout[]> {
  if (feedCache && Date.now() - feedCache.at < 15000) return feedCache.posts;
  const { blobs } = await list({ prefix: PREFIX, limit: 60, token: token() });
  const posts = (await Promise.all(blobs.map(async (b) => {
    try { const r = await fetch(b.url, { signal: AbortSignal.timeout(8000) }); return r.ok ? ((await r.json()) as Callout) : null; } catch { return null; }
  }))).filter((p): p is Callout => !!p && typeof p.id === 'string');
  feedCache = { at: Date.now(), posts };
  return posts;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  const enabled = !!token();
  if (req.method === 'GET') {
    if (!enabled) return res.status(200).json({ enabled: false, posts: [], minHolding: minHolding() });
    try {
      const chain = new URL(req.url, 'http://localhost').searchParams.get('chain');
      const posts = await feed();
      return res.status(200).json({ enabled: true, minHolding: minHolding(), posts: CALLOUT_CHAINS.includes(chain as CalloutChain) ? posts.filter((p) => p.chain === chain) : posts });
    } catch { return res.status(503).json({ error: 'Callouts are temporarily unavailable. Please retry.' }); }
  }
  if (req.method !== 'POST' && req.method !== 'DELETE') return res.status(405).json({ error: 'GET or POST required' });
  if (!req.headers.origin || new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ error: 'Origin rejected' });
  if (!enabled) return res.status(503).json({ error: 'Callouts open soon. Posting isn’t switched on yet.' });
  const b = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return null; } })() : req.body;
  if (!b || typeof b.wallet !== 'string' || typeof b.signature !== 'string' || !Number.isFinite(b.time)) return res.status(400).json({ error: 'Invalid request' });
  if (Math.abs(Date.now() - b.time) > MAX_SKEW_MS) return res.status(400).json({ error: 'This signature has expired. Please sign again.' });

  try {
    if (req.method === 'DELETE') {
      if (!admins().includes(b.wallet) || typeof b.id !== 'string' || !/^[0-9]{13}-[1-9A-HJ-NP-Za-km-z]{8}$/.test(b.id)) return res.status(403).json({ error: 'Not allowed' });
      if (!verifySolana(b.wallet, deleteMessage(b.id, b.time), b.signature)) return res.status(401).json({ error: 'Signature check failed' });
      const { blobs } = await list({ prefix: PREFIX + b.id, limit: 1, token: token() });
      if (blobs[0]) await del(blobs[0].url, { token: token() });
      feedCache = null;
      return res.status(200).json({ ok: true });
    }

    const chain = b.chain as CalloutChain;
    const tokenAddr = typeof b.token === 'string' ? b.token.trim() : '';
    const text = typeof b.text === 'string' ? b.text.replace(/\r\n?/g, '\n').trim() : '';
    if (!CALLOUT_CHAINS.includes(chain) || !validToken(chain, tokenAddr)) return res.status(400).json({ error: 'Enter a valid token address for the selected chain.' });
    if (!text || [...text].length > CALLOUT_MAX) return res.status(400).json({ error: `Write a callout of 1–${CALLOUT_MAX} characters.` });
    if (!verifySolana(b.wallet, calloutMessage({ chain, token: tokenAddr, time: b.time, text }), b.signature)) return res.status(401).json({ error: 'Signature check failed. Please sign again.' });

    const marker = `callouts/by/${b.wallet}/`;
    const recent = await list({ prefix: marker, limit: 1, token: token() });
    const last = recent.blobs[0] ? 9_999_999_999_999 - Number(recent.blobs[0].pathname.slice(marker.length, marker.length + 13)) : 0;
    if (Date.now() - last < COOLDOWN_MS) return res.status(429).json({ error: 'One callout every 10 minutes per wallet. Please wait a bit.' });

    const holding = await mocheBalance(b.wallet);
    const need = minHolding();
    if (holding < need) return res.status(403).json({ error: `Posting needs at least ${need.toLocaleString('en-US')} $MOCHE in this wallet. It holds ${Math.floor(holding).toLocaleString('en-US')}.` });

    const inv = String(9_999_999_999_999 - b.time).padStart(13, '0');
    const id = `${inv}-${b.wallet.slice(0, 8)}`;
    const post: Callout = { id, wallet: b.wallet, chain, token: tokenAddr, text, time: b.time, holding: Math.floor(holding) };
    await put(`${PREFIX}${id}.json`, JSON.stringify(post), { access: 'public', contentType: 'application/json', addRandomSuffix: false, token: token() });
    await put(`${marker}${inv}`, '1', { access: 'public', contentType: 'text/plain', addRandomSuffix: false, token: token() });
    feedCache = null;
    return res.status(200).json({ ok: true, post });
  } catch (e) {
    return res.status(503).json({ error: e instanceof Error && e.message === 'rpc' ? 'Couldn’t check your $MOCHE balance. Please retry.' : 'Callouts are temporarily unavailable. Please retry.' });
  }
}
