import bs58 from 'bs58';
import {normalizeCandles} from '../lib/candles';
const cache=new Map<string,{expires:number;value:any}>();
const inFlight=new Map<string,Promise<any>>();
const address=(v:string|null)=>{try{return !!v&&bs58.decode(v).length===32}catch{return false}};
async function cached(key:string,fn:()=>Promise<any>){
 const old=cache.get(key);if(old&&old.expires>Date.now())return old.value;
 if(inFlight.has(key))return inFlight.get(key);
 const pending=fn().then(value=>{if(cache.size>1000)cache.clear();cache.set(key,{expires:Date.now()+30000,value});return value}).finally(()=>inFlight.delete(key));
 inFlight.set(key,pending);return pending;
}
async function gecko(path:string){
 const r=await fetch('https://api.geckoterminal.com/api/v2'+path,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new Error(r.status===404?'This pool is not indexed yet.':r.status===429?'Market data is busy. Please retry shortly.':'Market data is temporarily unavailable.');
 return r.json();
}
export default async function handler(req:any,res:any){
 if(req.method!=='GET')return res.status(405).json({error:'GET required'});
 try{
  const params=new URL(req.url,'http://localhost').searchParams;
  const mint=params.get('mint');if(!address(mint))return res.status(400).json({error:'Invalid token address'});
  const mode=params.get('mode')||'price';let value;
  if(mode==='price')value=await cached(`price:${mint}`,async()=>{
   const data=await gecko(`/simple/networks/solana/token_price/${mint}`);
   const price=Number(data?.data?.attributes?.token_prices?.[mint!]);
   if(!Number.isFinite(price)||price<=0)throw new Error('No reliable USD price is available for this quote asset. Choose another pair.');
   return {mint,usd:price,asOf:Date.now(),source:'GeckoTerminal'};
  });
  else if(mode==='candles'){
   const pool=params.get('pool'),quote=params.get('quote'),interval=params.get('interval')||'1m',currency=params.get('currency')||'token';
   const choices:Record<string,[string,number]>={'1m':['minute',1],'5m':['minute',5],'15m':['minute',15],'1h':['hour',1]};
   if(!address(pool)||!address(quote)||!choices[interval]||!['usd','token'].includes(currency))return res.status(400).json({error:'Invalid pool or chart interval'});
   value=await cached(`candles:${pool}:${mint}:${quote}:${interval}:${currency}`,async()=>{
    const [frame,aggregate]=choices[interval];
    const data=await gecko(`/networks/solana/pools/${pool}/ohlcv/${frame}?aggregate=${aggregate}&limit=300&currency=${currency}&token=${mint}`);
    const pair=[data?.meta?.base?.address,data?.meta?.quote?.address];
    if(!pair.includes(mint)||!pair.includes(quote))throw new Error('Indexed chart pair does not match this market.');
    return {candles:normalizeCandles(data?.data?.attributes?.ohlcv_list),source:'GeckoTerminal',asOf:Date.now(),currency:currency==='usd'?'USD':quote};
   });
  }else return res.status(400).json({error:'Unsupported market data request'});
  res.setHeader('Cache-Control','public, s-maxage=15');return res.status(200).json(value);
 }catch(e){res.setHeader('Cache-Control','no-store');return res.status(503).json({error:e instanceof Error?e.message:'Market data unavailable'});}
}
