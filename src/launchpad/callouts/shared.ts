export type CalloutChain = 'solana' | 'elysium' | 'robinhood';
export const CALLOUT_CHAINS: CalloutChain[] = ['solana', 'elysium', 'robinhood'];
export const CALLOUT_MAX = 280;
/** Default minimum $MOCHE balance needed to post. Override with CALLOUTS_MIN_MOCHE on the server. */
export const CALLOUT_MIN_MOCHE = 1_000_000;

export type Callout = {
  id: string;
  wallet: string;
  chain: CalloutChain;
  token: string;
  text: string;
  time: number;
  holding: number;
};

export function calloutMessage(p: { chain: CalloutChain; token: string; time: number; text: string }) {
  return `usemoche callout\nchain: ${p.chain}\ntoken: ${p.token}\ntime: ${p.time}\n\n${p.text}`;
}
export function deleteMessage(id: string, time: number) {
  return `usemoche delete callout\nid: ${id}\ntime: ${time}`;
}

export const isEvmAddress = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v);
export const isSolAddress = (v: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
export function validToken(chain: CalloutChain, token: string) {
  return chain === 'solana' ? isSolAddress(token) : isEvmAddress(token);
}
