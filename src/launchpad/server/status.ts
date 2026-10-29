export default function handler(req:any,res:any){
 res.setHeader('Cache-Control','no-store');
 res.status(200).json({network:'mainnet-beta',uploadsEnabled:!!process.env.PINATA_JWT,signing:'user-wallet',version:'1.0.0'});
}
