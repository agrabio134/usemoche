import { serverEnv } from './env';
// Read-only relay for EVM chains. Wallets sign and broadcast through their own RPC; this never sends transactions.
const chains: Record<string, { id: number; rpc: () => string }> = {
  elysium: { id: 99901, rpc: () => serverEnv('ELYSIUM_RPC_URL') || 'https://rpc.elysium.kinetiq.xyz' },
  robinhood: { id: 4663, rpc: () => serverEnv('ROBINHOOD_RPC_URL') || 'https://rpc.mainnet.chain.robinhood.com' },
};
const methods = new Set(['eth_chainId', 'eth_blockNumber', 'eth_call', 'eth_getBalance', 'eth_getCode', 'eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_getBlockByNumber', 'eth_estimateGas', 'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory', 'eth_getTransactionCount', 'eth_getLogs']);
const callers = new Map<string, { time: number; count: number }>();
const verified = new Map<string, number>();

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Origin rejected' }); } catch { return res.status(403).json({ error: 'Origin rejected' }); } }
  const key = new URL(req.url, 'http://localhost').searchParams.get('chain') || '';
  const chain = chains[key];
  if (!chain) return res.status(400).json({ error: 'Unknown chain' });
  const ip = String(req.headers['x-forwarded-for'] || 'local').split(',')[0]; const now = Date.now();
  if (callers.size > 5000) callers.clear();
  const b = callers.get(ip); if (!b || now - b.time > 60000) callers.set(ip, { time: now, count: 1 }); else if (++b.count > 300) return res.status(429).json({ error: 'Please wait a minute before retrying.' });
  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body;
  const calls = Array.isArray(body) ? body : [body];
  if (!calls.length || calls.length > 20 || JSON.stringify(body).length > 60000 || calls.some((c: any) => c?.jsonrpc !== '2.0' || !methods.has(c?.method)))
    return res.status(400).json({ error: 'Unsupported RPC request' });
  if (calls.some((c: any) => c.method === 'eth_getLogs' && (!c.params?.[0]?.address || c.params?.[0]?.fromBlock === 'earliest')))
    return res.status(400).json({ error: 'Logs must be filtered by contract and block range' });
  try {
    const rpc = async (payload: unknown) => {
      const r = await fetch(chain.rpc(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('RPC unavailable');
      return r.json();
    };
    if (now - (verified.get(key) || 0) > 60000) {
      const id = await rpc({ jsonrpc: '2.0', id: 0, method: 'eth_chainId', params: [] });
      if (Number(id.result) !== chain.id) throw new Error('Wrong network');
      verified.set(key, now);
    }
    return res.status(200).json(await rpc(body));
  } catch {
    return res.status(503).json({ jsonrpc: '2.0', id: Array.isArray(body) ? null : body?.id ?? null, error: { code: -32000, message: 'Network RPC unavailable. Retry shortly.' } });
  }
}
function safeJson(s: string) { try { return JSON.parse(s); } catch { return null; } }
