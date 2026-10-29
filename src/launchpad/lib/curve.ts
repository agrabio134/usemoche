import { buildCurveWithMarketCap, ActivationType, BaseFeeMode, CollectFeeMode, MigrationFeeOption, MigrationOption, TokenAuthorityOption, TokenDecimal, TokenType } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { launchSchema, type LaunchInput } from './validation';
export function curveFor(input:LaunchInput,quoteDecimals:number){
 const p=launchSchema.parse(input);
 return buildCurveWithMarketCap({
 token:{tokenType:TokenType.SPLToken,tokenBaseDecimal:TokenDecimal.SIX,tokenQuoteDecimal:quoteDecimals,tokenAuthorityOption:TokenAuthorityOption.Immutable,totalTokenSupply:1_000_000_000,leftover:0},
 fee:{baseFeeParams:{baseFeeMode:BaseFeeMode.FeeSchedulerLinear,feeSchedulerParam:{startingFeeBps:p.shield?Math.max(1000,p.feeBps):p.feeBps,endingFeeBps:p.feeBps,numberOfPeriod:p.shield?60:0,totalDuration:p.shield?300:0}},dynamicFeeEnabled:p.dynamic,collectFeeMode:CollectFeeMode.QuoteToken,creatorTradingFeePercentage:50,poolCreationFee:0,enableFirstSwapWithMinFee:false},
 migration:{migrationOption:MigrationOption.MET_DAMM_V2,migrationFeeOption:MigrationFeeOption.FixedBps100,migrationFee:{feePercentage:0,creatorFeePercentage:0}},
 liquidityDistribution:{partnerLiquidityPercentage:0,partnerPermanentLockedLiquidityPercentage:50,creatorLiquidityPercentage:0,creatorPermanentLockedLiquidityPercentage:50},
 lockedVesting:{totalLockedVestingAmount:0,numberOfVestingPeriod:0,cliffUnlockAmount:0,totalVestingDuration:0,cliffDurationFromMigrationTime:0},
 activationType:ActivationType.Timestamp,initialMarketCap:p.initialCap,migrationMarketCap:p.graduationCap
 });
}
