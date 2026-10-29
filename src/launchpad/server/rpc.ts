import { serverEnv } from './env';
import { MAINNET_GENESIS } from '../lib/constants';
// Never loads or uses a deployment private key. Only relays a narrow set of RPC calls.
const methods=new Set(['getGenesisHash','getAccountInfo','getMultipleAccounts','getProgramAccounts','getLatestBlockhash','getBlockHeight','getBalance','getSlot','getBlockTime','getEpochInfo','getMinimumBalanceForRentExemption','getFeeForMessage','getTokenAccountsByOwner','getTokenAccountBalance','getTokenSupply','getSignatureStatuses','getSignaturesForAddress','getTransaction','simulateTransaction','sendTransaction']);
const callers=new Map<string,{time:number;count:number}>();
let checkedAt=0;
export default async function handler(req:any,res:any){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'POST required'});
 const origin=req.headers.origin;
 if(origin){try{if(new URL(origin).host!==req.headers.host)return res.status(403).json({error:'Origin rejected'});}catch{return res.status(403).json({error:'Origin rejected'});}}
 const ip=String(req.headers['x-forwarded-for']||'local').split(',')[0];const now=Date.now();
 if(callers.size>5000)callers.clear();
 const budget=callers.get(ip); if(!budget||now-budget.time>60000)callers.set(ip,{time:now,count:1});else if(++budget.count>240)return res.status(429).json({error:'Please wait a minute before retrying.'});
 try{
 const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
 if(!body||Array.isArray(body)||body.jsonrpc!=='2.0'||!methods.has(body.method)||JSON.stringify(body).length>12000) return res.status(400).json({error:'Unsupported RPC request'});
 if(body.method==='getProgramAccounts'){
   const allowed=['dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN','cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG'];
   if(!allowed.includes(body.params?.[0])||!body.params?.[1]?.filters?.some((f:any)=>f.memcmp))return res.status(400).json({error:'Filtered launchpad program requests only'});
 }
 const endpoint=serverEnv('MAINNET_RPC_URL')||'https://api.mainnet-beta.solana.com';
 const rpc=async(payload:unknown)=>{
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('RPC unavailable');return response.json();
 };
 if(now-checkedAt>60000){const genesis=await rpc({jsonrpc:'2.0',id:0,method:'getGenesisHash'});if(genesis.result!==MAINNET_GENESIS)throw new Error('Wrong network');checkedAt=now;}
 const result=await rpc(body);return res.status(200).json(result);
 }catch{return res.status(503).json({jsonrpc:'2.0',id:req.body?.id??null,error:{code:-32000,message:'Mainnet RPC unavailable. Retry shortly; if this persists, a dedicated MAINNET_RPC_URL is required.'}});}
}
