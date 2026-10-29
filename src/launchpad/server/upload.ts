import bs58 from 'bs58';
import { z } from 'zod';
import { LAUNCHPAD_TAG } from '../lib/constants';

const wallet=z.string().min(32).max(44).refine(value=>{try{return bs58.decode(value).length===32}catch{return false}});
const schema=z.object({address:wallet,image:z.string().max(2_800_000),type:z.enum(['image/png','image/jpeg','image/webp']),name:z.string().trim().min(1).max(32),symbol:z.string().regex(/^[A-Z0-9]{2,10}$/),description:z.string().max(1000),website:z.string().max(200)});
// Wallet connection is enforced by the UI. An unsigned address is not proof of ownership.
// These per-instance budgets limit storage use; provider quotas cover aggregate traffic.
const budgets=new Map<string,{until:number;count:number}>();
function takeBudget(key:string,limit:number){
 const now=Date.now();for(const [k,b] of budgets)if(b.until<=now)budgets.delete(k);
 const b=budgets.get(key);if(b){if(b.count>=limit)return false;b.count++;return true}
 if(budgets.size>=5000)return false;
 budgets.set(key,{until:now+3600000,count:1});return true;
}
class StorageError extends Error{}
async function pin(url:string,init:RequestInit){
 const response=await fetch(url,{...init,signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new StorageError(response.status===429?'Image storage is busy. Please retry in a few minutes.':'Image storage is temporarily unavailable. Please retry.');
 let body:any;try{body=await response.json()}catch{throw new StorageError('Image storage returned an invalid response. Please retry.')}
 if(typeof body?.IpfsHash!=='string'||!/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(body.IpfsHash))throw new StorageError('Image storage returned an invalid file address. Please retry.');
 return body.IpfsHash as string;
}
export default async function handler(req:any,res:any){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'POST required'});
 if(!process.env.PINATA_JWT)return res.status(503).json({error:'Image storage is not configured. Please try again later.'});
 try{
  if(!req.headers.origin||new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({error:'Origin rejected'});
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!wallet.safeParse(body?.address).success)return res.status(401).json({error:'Connect your wallet before uploading an image.'});
  const d=schema.parse(body);
  if(Buffer.byteLength(d.name,'utf8')>32)throw new Error('Token name must be at most 32 UTF-8 bytes');
  if(d.website && new URL(d.website).protocol!=='https:')throw new Error('Website must use HTTPS');
  const image=Buffer.from(d.image,'base64');if(image.length>2*1024*1024||image.length<12)throw new Error('Choose an image under 2 MB.');
  const valid=d.type==='image/png'?image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):d.type==='image/jpeg'?image[0]===255&&image[1]===216&&image[2]===255:image.subarray(0,4).toString()==='RIFF'&&image.subarray(8,12).toString()==='WEBP';
  if(!valid)throw new Error('Invalid image format. Choose PNG, JPG or WebP.');
  const ip=String(req.headers['x-forwarded-for']||'local').split(',')[0].trim();
  if(!takeBudget(`ip:${ip}`,20)||!takeBudget(`wallet:${d.address}`,10))return res.status(429).json({error:'Upload limit reached. Please try again in an hour.'});
  const headers={Authorization:`Bearer ${process.env.PINATA_JWT}`};
  const form=new FormData();form.append('file',new Blob([image],{type:d.type}),`${d.symbol}.${d.type==='image/jpeg'?'jpg':d.type.split('/')[1]}`);form.append('pinataOptions',JSON.stringify({cidVersion:0}));
  const artwork=await pin('https://api.pinata.cloud/pinning/pinFileToIPFS',{method:'POST',headers,body:form});
  const imageUrl=`https://ipfs.io/ipfs/${artwork}`;
  const metadata={name:d.name,symbol:d.symbol,description:d.description,image:imageUrl,external_url:d.website,properties:{files:[{uri:imageUrl,type:d.type}],category:'image',launchpad:LAUNCHPAD_TAG}};
  const metadataHash=await pin('https://api.pinata.cloud/pinning/pinJSONToIPFS',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({pinataContent:metadata,pinataOptions:{cidVersion:0},pinataMetadata:{name:`${d.symbol}-metadata`}})});
  return res.status(200).json({uri:`ipfs://${metadataHash}`,image:imageUrl});
 }catch(e){
  if(e instanceof z.ZodError)return res.status(400).json({error:'Check the token name, ticker, and image format.'});
  if(e instanceof StorageError)return res.status(502).json({error:e.message});
  if(e instanceof Error&&(e.name==='TimeoutError'||e.name==='AbortError'))return res.status(504).json({error:'Image storage timed out. Please retry.'});
  return res.status(400).json({error:e instanceof SyntaxError?'Invalid upload request. Please try again.':e instanceof Error?e.message:'Upload failed. Please retry.'});
 }
}
