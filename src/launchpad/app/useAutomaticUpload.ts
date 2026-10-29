import { useEffect, useRef, useState } from 'react';

// Keep the selected file queued while identity fields or wallet connection are missing.
// A failed upload is retried only after another explicit user action.
export function useAutomaticUpload<T>({identity,ready,connected,busy,upload,connect}:{identity:string;ready:boolean;connected:boolean;busy:boolean;upload:(file:T)=>Promise<unknown>;connect:()=>void}) {
 const [queued,setQueued]=useState<{file:T}|null>(null);
 const requestedConnection=useRef(false);
 const callbacks=useRef({upload,connect});callbacks.current={upload,connect};
 useEffect(()=>{
  if(!queued||!ready||busy)return;
  const timer=setTimeout(()=>{
   if(!connected){
    if(!requestedConnection.current){requestedConnection.current=true;callbacks.current.connect();}
    return;
   }
   setQueued(null);
   void callbacks.current.upload(queued.file);
  },500);
  return()=>clearTimeout(timer);
 },[queued,identity,ready,connected,busy]);
 return {uploadQueued:!!queued,cancelUpload:()=>setQueued(null),queueUpload:(file:T)=>{requestedConnection.current=false;setQueued({file});}};
}
