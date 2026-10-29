export async function readApiJson(response:Response,operation='Request'):Promise<any>{
 const text=await response.text();
 let data:any;
 try{data=JSON.parse(text)}catch{
  if(response.status===413)throw new Error('The image is too large. Choose a file under 2 MB.');
  if(response.status===401||response.status===403)throw new Error(`${operation} access expired. Refresh the preview and reconnect your wallet.`);
  throw new Error(`${operation} service returned an unexpected response (HTTP ${response.status}). Please try again shortly.`);
 }
 if(!response.ok)throw new Error(typeof data?.error==='string'?data.error:`${operation} failed (HTTP ${response.status}). Please retry.`);
 if(!data||typeof data!=='object'||Array.isArray(data))throw new Error(`${operation} returned an invalid result. Please retry.`);
 return data;
}
