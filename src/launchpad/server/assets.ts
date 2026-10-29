import { CORE_ASSETS, type Asset } from '../lib/constants';
let cache:{time:number;assets:Asset[]}|undefined;
export default async function handler(req:any,res:any){
 if(req.method!=='GET')return res.status(405).json({error:'GET required'});
 try{
 if(!cache||Date.now()-cache.time>300000){
  const assets:Asset[]=[...CORE_ASSETS];
  for(let page=0;page<30;page++){
   const r=await fetch(`https://api.xstocks.fi/api/v2/public/assets?network=Solana&pageSize=100&page=${page}`,{signal:AbortSignal.timeout(12000)});
   if(!r.ok)throw new Error('Issuer unavailable');const data=await r.json();
   for(const a of data.nodes??[]){const d=a.deployments?.find((x:any)=>x.network==='Solana');if(d)assets.push({mint:d.address,symbol:a.symbol,name:a.name,logo:a.logo,category:'stock',halted:a.isTradingHalted});}
   if(!data.page?.hasNextPage)break;
  }
  const preferred=['HYPE','SOL','USDC','NVDAx','AAPLx','TSLAx','SPYx','QQQx','MSTRx','AMZNx','GOOGLx','METAx','MSFTx','COINx'];
  const rank=(symbol:string)=>{const n=preferred.indexOf(symbol);return n<0?999:n};
  assets.sort((a,b)=>rank(a.symbol)-rank(b.symbol)||a.symbol.localeCompare(b.symbol));
  cache={time:Date.now(),assets};
 }
 res.setHeader('Cache-Control','public, s-maxage=120');
 return res.status(200).json({assets:cache.assets,source:'https://docs.xstocks.fi/apis/openapi/assets',updatedAt:new Date(cache.time).toISOString()});
 }catch{return res.status(200).json({assets:CORE_ASSETS,error:'The issuer stock catalogue is temporarily unavailable. Stock launches are paused; HYPE, SOL and USDC remain selectable.'});}
}
