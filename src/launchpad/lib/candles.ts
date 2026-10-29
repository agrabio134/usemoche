export type Candle={time:number;open:number;high:number;low:number;close:number;volume:number};
export function normalizeCandles(rows:unknown):Candle[]{
 if(!Array.isArray(rows))return [];
 const unique=new Map<number,Candle>();
 for(const row of rows){
  if(!Array.isArray(row)||row.length<6||!row.every(Number.isFinite))continue;
  const [time,open,high,low,close,volume]=row;
  if(!Number.isInteger(time)||time<=0||Math.min(open,high,low,close)<=0||volume<0||high<Math.max(open,close,low)||low>Math.min(open,close,high))continue;
  unique.set(time,{time,open,high,low,close,volume});
 }
 return [...unique.values()].sort((a,b)=>a.time-b.time);
}
export function sampleCandle(previous:Candle|undefined,time:number,price:number,interval:number):Candle{
 const bucket=Math.floor(time/interval)*interval;
 if(!Number.isFinite(price)||price<=0)throw new Error('Invalid spot price');
 if(previous&&previous.time===bucket)return {...previous,high:Math.max(previous.high,price),low:Math.min(previous.low,price),close:price};
 return {time:bucket,open:price,high:price,low:price,close:price,volume:0};
}
