import {getLaunchPricing} from './pricing';
import {useEffect,useRef,useState} from 'react';
import {LineSeries,ColorType,createChart,type IChartApi,type ISeriesApi,type UTCTimestamp} from 'lightweight-charts';
import {readApiJson} from '../lib/http';
import {sampleCandle,type Candle} from '../lib/candles';
import type {Market} from './chain';

export function MarketChart({market}:{market:Market;quoteSymbol:string}){
 const element=useRef<HTMLDivElement>(null),chart=useRef<IChartApi|null>(null),series=useRef<ISeriesApi<'Line'>|null>(null);
 const [quoteUsd,setQuoteUsd]=useState<{usd:number;asOf:number}|null>(null),[candles,setCandles]=useState<Candle[]>([]),[historyLoaded,setHistoryLoaded]=useState(false),[historyFailed,setHistoryFailed]=useState(false);
 useEffect(()=>{let active=true;setQuoteUsd(null);async function price(){try{const p=await getLaunchPricing(market.quoteMint);if(active)setQuoteUsd(p)}catch{if(active)setQuoteUsd(null)}}price();const timer=setInterval(price,30000);return()=>{active=false;clearInterval(timer)}},[market.quoteMint]);
 useEffect(()=>{
  if(!element.current)return;
  const c=createChart(element.current,{autoSize:true,height:360,layout:{background:{type:ColorType.Solid,color:'#ffffff'},textColor:'#5b6889',attributionLogo:true},grid:{vertLines:{visible:false},horzLines:{color:'#edf2f9'}},rightPriceScale:{borderVisible:false},timeScale:{borderVisible:false,timeVisible:true,secondsVisible:false},crosshair:{vertLine:{color:'#2455f555'},horzLine:{color:'#2455f555'}}});
  chart.current=c;series.current=c.addSeries(LineSeries,{color:'#2455f5',lineWidth:3,crosshairMarkerVisible:true,pointMarkersVisible:true,pointMarkersRadius:2,priceFormat:{type:'price',precision:10,minMove:0.0000000001}});
  return()=>{c.remove();chart.current=null;series.current=null};
 },[]);
 useEffect(()=>{
  let active=true;setCandles([]);setHistoryLoaded(false);setHistoryFailed(false);
  async function history(){
   try{
    const d=await readApiJson(await fetch(`/api/market-data?mode=candles&pool=${market.tradingPool}&mint=${market.baseMint}&quote=${market.quoteMint}&interval=1m&currency=usd`,{signal:AbortSignal.timeout(12000)}),'Chart history');
    if(!active)return;
    if(d.currency!=='USD')throw new Error('Chart currency mismatch');
    setCandles(previous=>{const map=new Map<number,Candle>((d.candles as Candle[]).map(c=>[c.time,c]));for(const c of previous){const old=map.get(c.time);map.set(c.time,old?{...old,high:Math.max(old.high,c.high),low:Math.min(old.low,c.low),close:c.close}:c)}return [...map.values()].sort((a,b)=>a.time-b.time).slice(-400)});
    setHistoryLoaded(d.candles.length>0);setHistoryFailed(false);
   }catch{if(active)setHistoryFailed(true)}
  }
  history();const timer=setInterval(history,30000);
  return()=>{active=false;clearInterval(timer)};
 },[market.tradingPool,market.baseMint,market.quoteMint]);
 useEffect(()=>{
  if(!Number.isFinite(market.price)||market.price<=0||!quoteUsd||Date.now()-quoteUsd.asOf>120000)return;
  const price=market.price*quoteUsd.usd,time=Math.floor(market.observedAt/1000);
  setCandles(previous=>{const last=previous.at(-1);const next=sampleCandle(last,time,price,60);if(last&&next.time<last.time)return previous;return [...(last?.time===next.time?previous.slice(0,-1):previous),next].slice(-400)});
 },[market.price,market.observedAt,market.tradingPool,quoteUsd]);
 const fitted=useRef('');
 useEffect(()=>{
  series.current?.setData(candles.map(c=>({time:c.time as UTCTimestamp,value:c.close})));
  const id=market.tradingPool+historyLoaded;if(candles.length>1&&fitted.current!==id){chart.current?.timeScale().fitContent();fitted.current=id;}
 },[candles,market.tradingPool,historyLoaded]);
 return <section className="panel market-chart"><div className="chart-line-heading"><h3>{market.symbol||'Token'} / USD</h3></div><div ref={element} className="chart-canvas" role="img" aria-label={`${market.symbol||'Token'} USD price line chart`}/>{!candles.length&&<p className="chart-empty" role="status">{historyFailed?'Price data unavailable':'Loading price…'}</p>}<a className="chart-attribution" href="https://www.tradingview.com/" target="_blank" rel="noreferrer" title="Historical data from GeckoTerminal; live updates from on-chain spot prices">TradingView Lightweight Charts™ · Copyright (с) 2025 TradingView, Inc.</a></section>;
}
