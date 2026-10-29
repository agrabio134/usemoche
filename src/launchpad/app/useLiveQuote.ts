import {useEffect,useRef,useState} from 'react';
export function useLiveQuote<T>({requestKey,enabled,fetchQuote,refreshMs=10000,debounceMs=250}:{requestKey:string;enabled:boolean;fetchQuote:()=>Promise<T>;refreshMs?:number;debounceMs?:number}){
 const latest=useRef(fetchQuote);latest.current=fetchQuote;
 const [state,setState]=useState<{key:string;quote:T|null;error:string;refreshing:boolean}>({key:'',quote:null,error:'',refreshing:false});
 useEffect(()=>{
  let active=true;let timer:ReturnType<typeof setTimeout>;
  if(!enabled){setState({key:requestKey,quote:null,error:'',refreshing:false});return}
  setState({key:requestKey,quote:null,error:'',refreshing:true});
  async function update(){
   if(!active)return;
   setState(s=>({...s,refreshing:true}));
   try{const quote=await latest.current();if(active)setState({key:requestKey,quote,error:'',refreshing:false})}
   catch(e){if(active)setState(s=>({...s,error:e instanceof Error?e.message:'Quote unavailable. Retrying automatically.',refreshing:false}))}
   finally{if(active)timer=setTimeout(update,refreshMs)}
  }
  timer=setTimeout(update,debounceMs);
  return()=>{active=false;clearTimeout(timer)};
 },[requestKey,enabled,refreshMs,debounceMs]);
 return state.key===requestKey?state:{key:requestKey,quote:null,error:'',refreshing:enabled};
}
