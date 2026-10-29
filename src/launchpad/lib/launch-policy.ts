export const OPENING_MARKET_CAP_USD=4_000;
export const GRADUATION_MARKET_CAP_USD=35_000;
export function fixedLaunchCaps(quoteUsd:number){
 if(!Number.isFinite(quoteUsd)||quoteUsd<=0)throw new Error('A current quote-token USD price is required to launch.');
 return {initialCap:OPENING_MARKET_CAP_USD/quoteUsd,graduationCap:GRADUATION_MARKET_CAP_USD/quoteUsd};
}
