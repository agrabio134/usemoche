import {readApiJson} from '../lib/http';
import {fixedLaunchCaps} from '../lib/launch-policy';
export type LaunchPricing={mint:string;usd:number;asOf:number;initialCap:number;graduationCap:number};
export async function getLaunchPricing(mint:string):Promise<LaunchPricing>{
 const data=await readApiJson(await fetch(`/api/market-data?mode=price&mint=${mint}`,{signal:AbortSignal.timeout(12000)}),'Quote-token price');
 if(data.mint!==mint||!Number.isFinite(data.asOf)||Date.now()-data.asOf>120000||data.asOf>Date.now()+30000)throw new Error('Quote-token price is outdated. Retry before launching.');
 return {...fixedLaunchCaps(data.usd),mint,usd:data.usd,asOf:data.asOf};
}
