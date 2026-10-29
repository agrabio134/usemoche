import {useEffect,useState} from 'react';
import {Copy,Check,ExternalLink} from 'lucide-react';
import {safeUrl} from '../lib/validation';
import {getLaunchPricing} from './pricing';
import type {Market} from './chain';
type Metadata={image?:string;description?:string;website?:string};
const cache=new Map<string,Metadata>();
function url(v:unknown){try{return typeof v==='string'?safeUrl(v).replace('https://ipfs.io/ipfs/','https://gateway.pinata.cloud/ipfs/'):undefined}catch{return undefined}}
function useMetadata(uri?:string){
 const [data,setData]=useState<Metadata>({});
 useEffect(()=>{setData({});if(!uri)return;const cached=cache.get(uri);if(cached){setData(cached);return}const controller=new AbortController();let active=true;const timer=setTimeout(()=>controller.abort(),10000);
 (async()=>{try{const source=url(uri);if(!source)return;const r=await fetch(source,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});if(!r.ok)return;const text=await r.text();if(text.length>200000)return;const raw=JSON.parse(text);const next={image:url(raw.image),description:typeof raw.description==='string'?raw.description.slice(0,1000):undefined,website:url(raw.external_url)};cache.set(uri,next);if(active)setData(next)}catch{}finally{clearTimeout(timer)}})();return()=>{active=false;clearTimeout(timer);controller.abort()};
 },[uri]);return data;
}
export function TokenArtwork({market,large=false}:{market:Market;large?:boolean}){
 const data=useMetadata(market.uri),[failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[data.image]);
 return <span className={'token-avatar'+(large?' large':'')}>{data.image&&!failed?<img src={data.image} alt={market.name||'Token artwork'} referrerPolicy="no-referrer" loading="lazy" onError={()=>setFailed(true)}/>:market.symbol?.slice(0,2)||'M'}</span>;
}
export function ContractAddress({value}:{value:string}){
 const [status,setStatus]=useState('');useEffect(()=>setStatus(''),[value]);useEffect(()=>{if(!status)return;const timer=setTimeout(()=>setStatus(''),3000);return()=>clearTimeout(timer)},[status]);
 return <div className="contract-address"><span>CA</span><code title={value}>{value}</code><button aria-label="Copy token contract address" onClick={async()=>{try{await navigator.clipboard.writeText(value);setStatus('Copied')}catch{setStatus('Select the address to copy')}}}>{status==='Copied'?<Check size={15}/>:<Copy size={15}/>}</button><a href={'https://solscan.io/token/'+value} target="_blank" rel="noreferrer" aria-label="View token on Solscan"><ExternalLink size={15}/></a><small role="status">{status}</small></div>;
}
const usd=(n:number)=>n>0&&n<0.0001?'$'+n.toPrecision(4):new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:n<1?6:2}).format(n);
export function TokenMarketDetails({market,quoteSymbol}:{market:Market;quoteSymbol:string}){
 const metadata=useMetadata(market.uri),[price,setPrice]=useState<{usd:number;asOf:number}|null>(null);
 useEffect(()=>{let active=true;setPrice(null);async function refresh(){try{const p=await getLaunchPricing(market.quoteMint);if(active)setPrice(p)}catch{if(active)setPrice(null)}}refresh();const timer=setInterval(refresh,30000);return()=>{active=false;clearInterval(timer)}},[market.quoteMint]);
 const conversion=price&&Date.now()-price.asOf<120000?price.usd:null;
 return <><section className="token-key-metrics" aria-label="Token market statistics"><div><span>Market cap / FDV</span><strong>{conversion?usd(market.price*market.supply*conversion):'USD unavailable'}</strong><small>Spot price × total supply</small></div><div><span>Token price</span><strong>{conversion?usd(market.price*conversion):'USD unavailable'}</strong><small>Quoted in {quoteSymbol}</small></div><div><span>Total supply</span><strong title={market.supply.toLocaleString('en-US')}>{new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(market.supply)}</strong><small>{market.symbol||'tokens'} · on-chain</small></div><div><span>Graduation</span><strong>{market.migrated?'Graduated':(market.progress*100).toFixed(2)+'%'}</strong><small>{market.migrated?'Meteora DAMM v2':'Bonding curve'}</small></div></section>{(metadata.description||metadata.website)&&<section className="token-about"><p>{metadata.description}</p>{metadata.website&&<a href={metadata.website} target="_blank" rel="noopener noreferrer">Project website <ExternalLink size={13}/></a>}<small>Project-provided metadata</small></section>}</>;
}
