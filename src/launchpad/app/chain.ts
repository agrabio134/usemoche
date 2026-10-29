import { getLaunchPricing } from './pricing';
import { curveFor } from '../lib/curve';
export { curveFor } from '../lib/curve';
import { Connection, PublicKey, Keypair, Transaction, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import { DynamicBondingCurveClient, buildCurveWithMarketCap, ActivationType, BaseFeeMode, CollectFeeMode, MigrationFeeOption, MigrationOption, TokenAuthorityOption, TokenDecimal, TokenType, deriveDbcPoolAddress, deriveDammV2PoolAddress, DAMM_V2_MIGRATION_FEE_ADDRESS, deriveTokenBadgeAddress, getCurrentPoint, getPriceFromSqrtPrice } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { CpAmm } from '@meteora-ag/cp-amm-sdk';
import { unpackMint, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getExtensionTypes, ExtensionType, getScaledUiAmountConfig, getTransferFeeConfig, getPausableConfig, getTransferHook, getDefaultAccountState, AccountState, getAssociatedTokenAddressSync } from '@solana/spl-token';
import BN from 'bn.js';
import bs58 from 'bs58';
import { PLATFORM_WALLET, MAINNET_GENESIS, SOL, LISTING_START_UNIX, type Asset } from '../lib/constants';
import { launchSchema, type LaunchInput, toAtomic, fromAtomic, safeUrl } from '../lib/validation';
export const connection=new Connection(`${location.origin}/api/rpc`,{commitment:'confirmed',disableRetryOnRateLimit:true});
export const dbc=new DynamicBondingCurveClient(connection,'confirmed');
export const amm=new CpAmm(connection);
export const platform=new PublicKey(PLATFORM_WALLET);
export const short=(s:string)=>s.slice(0,5)+'…'+s.slice(-5);
export type WalletSession={wallet:any;account:any;address:string};
export async function assertMainnet(){if(await connection.getGenesisHash()!==MAINNET_GENESIS)throw new Error('RPC network mismatch. No transaction was sent.');}
export async function mintInfo(mint:string){
 const key=new PublicKey(mint),account=await connection.getAccountInfo(key);
 if(!account||(!account.owner.equals(TOKEN_PROGRAM_ID)&&!account.owner.equals(TOKEN_2022_PROGRAM_ID)))throw new Error('Quote mint is not a Solana token.');
 const info=unpackMint(key,account,account.owner);
 const ext=getExtensionTypes(info.tlvData);
 const hook=getTransferHook(info),fee=getTransferFeeConfig(info);
 if(ext.includes(ExtensionType.NonTransferable)||getPausableConfig(info)?.paused||getDefaultAccountState(info)?.state===AccountState.Frozen)throw new Error('This token is paused, frozen by default, or non-transferable.');
 if(hook&&!hook.programId.equals(PublicKey.default))throw new Error('This quote token has an active transfer hook that is not supported by the usemoche launchpad.');
 if(fee&&(fee.olderTransferFee.transferFeeBasisPoints!==0||fee.newerTransferFee.transferFeeBasisPoints!==0))throw new Error('Quote tokens with transfer fees are not supported by Meteora DBC.');
 const scaled=getScaledUiAmountConfig(info);
 const multiplier=scaled?(Date.now()/1000>=Number(scaled.newMultiplierEffectiveTimestamp)?scaled.newMultiplier:scaled.multiplier):1;
 return {info,program:account.owner,decimals:info.decimals,multiplier,scaled};
}
export async function validateAsset(asset:Asset){
 if(asset.category==='stock'){
  const r=await fetch('/api/assets');const d=await r.json();
  const current=d.assets?.find((a:Asset)=>a.mint===asset.mint&&a.category==='stock');
  if(!current||current.halted)throw new Error('The stock issuer has halted this asset or its current status is unavailable.');
 }
 return mintInfo(asset.mint);
}
export async function confirmSignature(signature:string,lastValidBlockHeight?:number){
 for(let i=0;i<45;i++){
  const state=(await connection.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];
  if(state?.err)throw new Error(`Transaction failed on-chain: ${signature}`);
  if(state?.confirmationStatus==='confirmed'||state?.confirmationStatus==='finalized')return;
  if(lastValidBlockHeight&&(await connection.getBlockHeight())>lastValidBlockHeight)throw new Error(`Transaction expired or confirmation is unknown. Check ${signature} before retrying.`);
  await new Promise(r=>setTimeout(r,2000));
 }
 throw new Error(`Confirmation is still pending. Check ${signature} before retrying.`);
}
export async function submit(tx:Transaction,signers:Keypair[],session:WalletSession,onStatus:(s:string)=>void){
 // Do not mutate a cached quote; a wallet rejection must be safely retryable.
 tx=new Transaction().add(...tx.instructions);
 await assertMainnet();
 const pending=localStorage.getItem('usemoche.pending');if(pending)throw new Error('A previous transaction is still recorded as pending. Check its explorer status and clear the reminder before submitting another transaction.');
 const payer=new PublicKey(session.address);
 if(!session.account.chains.includes('solana:mainnet'))throw new Error('Select Solana mainnet in your wallet.');
 const latest=await connection.getLatestBlockhash('confirmed');
 tx.feePayer=payer;tx.recentBlockhash=latest.blockhash;
 tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({units:600000}));
 if(!signers.length)tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitPrice({microLamports:1000}));
 if(signers.length)tx.partialSign(...signers);
 const versioned=new VersionedTransaction(tx.compileMessage());
 for(const signer of signers)versioned.sign([signer]);
 if(versioned.serialize().length>1232)throw new Error('Transaction is too large. Use a shorter metadata URI (prefer ipfs:// with a Qm CID), token name, or ticker before retrying.');
 onStatus('Simulating on mainnet…');
 const simulation=await connection.simulateTransaction(versioned,{sigVerify:false,commitment:'confirmed'});
 if(simulation.value.err)throw new Error('Mainnet simulation failed: '+JSON.stringify(simulation.value.err)+'. No funds were sent.');
 onStatus('Review and approve in your wallet.');
 const features=session.wallet.features;
 let signature:string;
 if(features['solana:signTransaction']){
  const [result]=await features['solana:signTransaction'].signTransaction({account:session.account,transaction:versioned.serialize(),chain:'solana:mainnet'});
  const signed=VersionedTransaction.deserialize(result.signedTransaction);
  if(!Buffer.from(signed.message.serialize()).equals(Buffer.from(versioned.message.serialize())))throw new Error('Wallet changed transaction contents; submission stopped.');
  signature=bs58.encode(signed.signatures[0]);
  localStorage.setItem('usemoche.pending',JSON.stringify({signature,time:Date.now()}));
  try{await connection.sendRawTransaction(result.signedTransaction,{skipPreflight:false,maxRetries:2,preflightCommitment:'confirmed'});}catch{throw new Error(`Submission could not be confirmed. Check ${signature} before retrying.`);}
 }else if(features['solana:signAndSendTransaction']){
  const [result]=await features['solana:signAndSendTransaction'].signAndSendTransaction({account:session.account,transaction:versioned.serialize(),chain:'solana:mainnet',options:{preflightCommitment:'confirmed'}});
  signature=bs58.encode(result.signature);localStorage.setItem('usemoche.pending',JSON.stringify({signature,time:Date.now()}));
 }else throw new Error('This wallet does not support Solana transactions.');
 onStatus(`Confirming ${short(signature)}…`);
 await confirmSignature(signature,latest.lastValidBlockHeight);
 localStorage.removeItem('usemoche.pending');
 return signature;
}
export async function launch(input:LaunchInput,asset:Asset,session:WalletSession,onStatus:(s:string)=>void){
 const pricing=await getLaunchPricing(asset.mint);
 const p=launchSchema.parse({...input,initialCap:pricing.initialCap,graduationCap:pricing.graduationCap});await assertMainnet();
 const mint=await validateAsset(asset);const curve=curveFor(p,mint.decimals);
 const payer=new PublicKey(session.address),quoteMint=new PublicKey(asset.mint);
 const config=Keypair.generate(),baseMint=Keypair.generate();
 const badge=await dbc.state.getTokenBadge(quoteMint);
 const tx=await dbc.partner.createConfigAndPool({...curve,config:config.publicKey,payer,feeClaimer:platform,leftoverReceiver:platform,quoteMint,tokenBadge:badge?deriveTokenBadgeAddress(quoteMint):undefined,preCreatePoolParam:{name:p.name,symbol:p.symbol,uri:p.uri,poolCreator:payer,baseMint:baseMint.publicKey}});
 onStatus('Create your token and market in one atomic transaction.');
 const signature=await submit(tx,[config,baseMint],session,onStatus);
 const pool=deriveDbcPoolAddress(quoteMint,baseMint.publicKey,config.publicKey).toBase58();
 return {pool,mint:baseMint.publicKey.toBase58(),signature};
}

export type Market={address:string;baseMint:string;quoteMint:string;creator:string;config:string;progress:number;migrated:boolean;price:number;quoteReserve:string;fees:string;tradingPool:string;supply:number;graduationCap:number;observedAt:number;uri?:string;name?:string;symbol?:string;image?:string;description?:string};
export async function loadMarket(address:string):Promise<Market>{
 const p=await dbc.state.getPool(address);if(!p)throw new Error('Pool not found on mainnet.');
 const c=await dbc.state.getPoolConfig(p.poolState.config);if(!c||!c.feeClaimer.equals(platform))throw new Error('This is not a usemoche launchpad pool.');
 const [q,base]=await Promise.all([mintInfo(c.quoteMint.toBase58()),mintInfo(p.poolState.baseMint.toBase58())]);
 let tradingPool=address,price=Number(getPriceFromSqrtPrice(p.poolState.sqrtPrice,c.tokenDecimal,q.decimals));
 if(p.poolState.isMigrated){const migrated=deriveDammV2PoolAddress(DAMM_V2_MIGRATION_FEE_ADDRESS[c.migrationFeeOption],p.poolState.baseMint,c.quoteMint);const state=await amm.fetchPoolState(migrated);const baseIsA=state.tokenAMint.equals(p.poolState.baseMint);const raw=Number(getPriceFromSqrtPrice(state.sqrtPrice,baseIsA?base.decimals:q.decimals,baseIsA?q.decimals:base.decimals));price=baseIsA?raw:1/raw;tradingPool=migrated.toBase58();}
 const metadata=await readTokenMetadata(p.poolState.baseMint).catch(()=>({}));
 return {...metadata,address,baseMint:p.poolState.baseMint.toBase58(),quoteMint:c.quoteMint.toBase58(),creator:p.poolState.creator.toBase58(),config:p.poolState.config.toBase58(),progress:Math.min(1,Number(p.poolState.quoteReserve.toString())/Number(c.migrationQuoteThreshold.toString())),migrated:!!p.poolState.isMigrated,price,tradingPool,supply:Number(fromAtomic(base.info.supply.toString(),base.decimals)),graduationCap:Number(getPriceFromSqrtPrice(c.migrationSqrtPrice,c.tokenDecimal,q.decimals))*Number(fromAtomic(c.preMigrationTokenSupply,c.tokenDecimal)),observedAt:Date.now(),quoteReserve:fromAtomic(p.poolState.quoteReserve,q.decimals),fees:fromAtomic(p.poolState.partnerQuoteFee.add(p.poolState.creatorQuoteFee),q.decimals)};
}
const metadataCache=new Map<string,{name:string;symbol:string;uri:string}>();
async function readTokenMetadata(mint:PublicKey){
 const cached=metadataCache.get(mint.toBase58());if(cached)return cached;
 const program=new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
 const [address]=PublicKey.findProgramAddressSync([Buffer.from('metadata'),program.toBuffer(),mint.toBuffer()],program);
 const account=await connection.getAccountInfo(address);if(!account||!account.owner.equals(program))throw new Error('No metadata');
 const data=account.data;let offset=65;
 function string(max:number){if(offset+4>data.length)throw new Error('Invalid metadata');const len=data.readUInt32LE(offset);offset+=4;if(len>max||offset+len>data.length)throw new Error('Invalid metadata');const value=data.subarray(offset,offset+len).toString('utf8').replace(/\0/g,'').trim();offset+=len;return value;}
 const result={name:string(32),symbol:string(10),uri:string(200)};metadataCache.set(mint.toBase58(),result);return result;
}
export async function listMarkets(creator?:string){
 const configs=await dbc.state.getPoolConfigsByOwner(platform);
 const pools=(await Promise.all(configs.map(c=>dbc.state.getPoolsByConfig(c.publicKey)))).flat();
 // Delisted from discovery; direct market access and creator fee claims remain available.
 const delistedPools=new Set(['7hcMR77XyetowGran4V1g25W9Zru5Q6khUspTC2YfXbt']);
 const fresh=pools.filter(p=>p.account.poolState.activationPoint.gten(LISTING_START_UNIX));
 const relevant=creator?fresh.filter(p=>p.account.poolState.creator.toBase58()===creator):fresh.filter(p=>!delistedPools.has(p.publicKey.toBase58()));
 return Promise.all(relevant.sort((a,b)=>b.account.poolState.activationPoint.cmp(a.account.poolState.activationPoint)).slice(0,24).map(p=>loadMarket(p.publicKey.toBase58())));
}
export async function tokenBalance(owner:string,mint:string){
 if(mint===SOL)return fromAtomic(new BN(await connection.getBalance(new PublicKey(owner))),9);
 const m=await mintInfo(mint);const ata=getAssociatedTokenAddressSync(new PublicKey(mint),new PublicKey(owner),false,m.program);
 try{return fromAtomic((await connection.getTokenAccountBalance(ata)).value.amount,m.decimals);}catch{return '0';}
}
export async function prepareSwap(market:Market,asset:Asset,amount:string,sell:boolean,slippageBps:number,owner:string){
 if(!Number.isInteger(slippageBps)||slippageBps<10||slippageBps>500)throw new Error('Slippage must be between 0.1% and 5%.');
 const [quoteMintInfo,base,pool]=await Promise.all([validateAsset(asset),mintInfo(market.baseMint),dbc.state.getPool(market.address)]);
 const amountIn=toAtomic(amount,sell?base.decimals:quoteMintInfo.decimals);
 if(!pool)throw new Error('Pool no longer available.');
 const config=await dbc.state.getPoolConfig(pool.poolState.config);if(!config||!config.feeClaimer.equals(platform))throw new Error('Invalid launchpad pool.');
 const payer=new PublicKey(owner);
 if(pool.poolState.isMigrated){
  const address=deriveDammV2PoolAddress(DAMM_V2_MIGRATION_FEE_ADDRESS[config.migrationFeeOption],new PublicKey(market.baseMint),config.quoteMint);
  const state=await amm.fetchPoolState(address);const slot=await connection.getSlot();const time=await connection.getBlockTime(slot);if(time===null)throw new Error('Chain time unavailable.');
  const input=new PublicKey(sell?market.baseMint:market.quoteMint),output=new PublicKey(sell?market.quoteMint:market.baseMint);
  const a=state.tokenAMint.equals(new PublicKey(market.baseMint))?base:quoteMintInfo,b=state.tokenBMint.equals(new PublicKey(market.baseMint))?base:quoteMintInfo;
  const q=amm.getQuote({inAmount:amountIn,inputTokenMint:input,slippage:slippageBps/100,poolState:state,currentTime:time,currentSlot:slot,tokenADecimal:a.decimals,tokenBDecimal:b.decimals});
  if(!q.consumedInAmount.eq(amountIn))throw new Error('This amount cannot be fully filled. Enter a smaller amount.');
  const tx=await amm.swap({payer,pool:address,inputTokenMint:input,outputTokenMint:output,amountIn,minimumAmountOut:q.minSwapOutAmount,tokenAMint:state.tokenAMint,tokenBMint:state.tokenBMint,tokenAVault:state.tokenAVault,tokenBVault:state.tokenBVault,tokenAProgram:a.program,tokenBProgram:b.program,referralTokenAccount:null,poolState:state});
  return {tx,out:fromAtomic(q.swapOutAmount,sell?quoteMintInfo.decimals:base.decimals),minimum:fromAtomic(q.minSwapOutAmount,sell?quoteMintInfo.decimals:base.decimals),route:'Meteora DAMM v2',created:Date.now(),priceImpact:q.priceImpact.toString()};
 }
 if(pool.poolState.quoteReserve.gte(config.migrationQuoteThreshold))throw new Error('Curve complete. Trading resumes after migration to DAMM v2.');
 const q=await dbc.pool.swapQuote({virtualPool:pool,config,swapBaseForQuote:sell,amountIn,slippageBps,hasReferral:false,eligibleForFirstSwapWithMinFee:false,currentPoint:await getCurrentPoint(connection,config.activationType)});
 if(q.minimumAmountOut.isZero())throw new Error('Amount is too small for a protected quote.');
 const tx=await dbc.pool.swap({owner:payer,pool:new PublicKey(market.address),amountIn,minimumAmountOut:q.minimumAmountOut,swapBaseForQuote:sell,referralTokenAccount:null});
 return {tx,out:fromAtomic(q.outputAmount,sell?quoteMintInfo.decimals:base.decimals),minimum:fromAtomic(q.minimumAmountOut,sell?quoteMintInfo.decimals:base.decimals),route:'Meteora bonding curve',created:Date.now(),priceImpact:null};
}
export async function claimFees(market:Market,session:WalletSession,onStatus:(s:string)=>void){
 const owner=new PublicKey(session.address),isPartner=owner.equals(platform);
 if(!isPartner&&market.creator!==session.address)throw new Error('Only the pool creator or platform wallet can claim these fees.');
 const tx=isPartner?await dbc.partner.claimPartnerTradingFeeToReceiver({feeClaimer:owner,payer:owner,pool:new PublicKey(market.address),maxBaseAmount:new BN('18446744073709551615'),maxQuoteAmount:new BN('18446744073709551615'),receiver:owner}):await dbc.creator.claimCreatorTradingFeeToReceiver({creator:owner,payer:owner,pool:new PublicKey(market.address),maxBaseAmount:new BN('18446744073709551615'),maxQuoteAmount:new BN('18446744073709551615'),receiver:owner});
 return submit(tx,[],session,onStatus);
}
export async function migratePool(market:Market,session:WalletSession,onStatus:(s:string)=>void){
 const p=await dbc.state.getPool(market.address);if(!p)throw new Error('Pool not found');const c=await dbc.state.getPoolConfig(p.poolState.config);
 if(!c||!c.feeClaimer.equals(platform)||p.poolState.isMigrated||p.poolState.quoteReserve.lt(c.migrationQuoteThreshold))throw new Error('This pool is not ready to migrate.');
 const migration=await dbc.migration.migrateToDammV2({payer:new PublicKey(session.address),pool:new PublicKey(market.address),dammConfig:DAMM_V2_MIGRATION_FEE_ADDRESS[c.migrationFeeOption]});
 return submit(migration.transaction,[migration.firstPositionNftKeypair,migration.secondPositionNftKeypair],session,onStatus);
}
export async function claimLpFees(market:Market,session:WalletSession,onStatus:(s:string)=>void){
 const p=await dbc.state.getPool(market.address);if(!p?.poolState.isMigrated)throw new Error('Pool is not migrated');const c=await dbc.state.getPoolConfig(p.poolState.config);if(!c||!c.feeClaimer.equals(platform))throw new Error('Invalid platform pool');
 const owner=new PublicKey(session.address),pool=deriveDammV2PoolAddress(DAMM_V2_MIGRATION_FEE_ADDRESS[c.migrationFeeOption],p.poolState.baseMint,c.quoteMint);
 const state=await amm.fetchPoolState(pool),positions=await amm.getUserPositionByPool(pool,owner);
 if(!positions.length)throw new Error('This wallet does not own a fee position in the graduated pool.');
 const a=await mintInfo(state.tokenAMint.toBase58()),b=await mintInfo(state.tokenBMint.toBase58());let signature='';
 for(const position of positions){const tx=await amm.claimPositionFee2({owner,position:position.position,positionNftAccount:position.positionNftAccount,pool,tokenAMint:state.tokenAMint,tokenBMint:state.tokenBMint,tokenAVault:state.tokenAVault,tokenBVault:state.tokenBVault,tokenAProgram:a.program,tokenBProgram:b.program,receiver:owner});signature=await submit(tx,[],session,onStatus);}
 return signature;
}
