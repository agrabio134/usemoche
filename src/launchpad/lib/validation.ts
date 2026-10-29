import BN from 'bn.js';
import { z } from 'zod';
export function toAtomic(value:string, decimals:number):BN {
 if(!Number.isInteger(decimals)||decimals<0||decimals>12||!/^\d+(\.\d+)?$/.test(value)) throw new Error('Enter a positive decimal amount.');
 const [whole,fraction='']=value.split('.');
 if(fraction.length>decimals) throw new Error(`This token supports ${decimals} decimal places.`);
 const amount=new BN(whole+fraction.padEnd(decimals,'0'));
 if(amount.isZero()||amount.bitLength()>64) throw new Error('Amount is outside the supported range.');
 return amount;
}
export function fromAtomic(value:BN|string, decimals:number):string {
 const s=value.toString().padStart(decimals+1,'0');
 if(!decimals)return s;
 return `${s.slice(0,-decimals)}.${s.slice(-decimals)}`.replace(/\.?0+$/,'');
}
export function safeUrl(value:string):string {
 if(value.startsWith('ipfs://'))value='https://ipfs.io/ipfs/'+value.slice(7);
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password)throw new Error('Use a public HTTPS or IPFS URL.');
 return u.href;
}
export const launchSchema=z.object({
 name:z.string().trim().min(1).max(32).refine(s=>new TextEncoder().encode(s).length<=32,'Name must be at most 32 UTF-8 bytes.'),
 symbol:z.string().trim().regex(/^[A-Z0-9]{2,10}$/,'Use 2–10 uppercase letters or digits.'),
 uri:z.string().min(1).max(100).refine(s=>{try{safeUrl(s);return true}catch{return false}},'Use an HTTPS or IPFS metadata JSON URL, at most 100 characters.'),
 initialCap:z.coerce.number().positive().max(1e9),
 graduationCap:z.coerce.number().positive().max(1e10),
 feeBps:z.coerce.number().int().min(100).max(300),
 dynamic:z.boolean(), shield:z.boolean()
}).refine(x=>x.graduationCap>=x.initialCap*3,'Graduation market cap must be at least 3 times the opening market cap.');
export type LaunchInput=z.infer<typeof launchSchema>;
