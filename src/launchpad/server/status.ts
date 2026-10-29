import { serverEnv } from './env';
export default function handler(req:any,res:any){
 res.setHeader('Cache-Control','no-store');
 res.status(200).json({network:'mainnet-beta',uploadsEnabled:!!serverEnv('PINATA_JWT'),signing:'user-wallet',version:'1.0.0'});
}
