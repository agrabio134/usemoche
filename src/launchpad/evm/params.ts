/**
 * Curve parameters for the MochePad contract, from the launchpad's USD economics.
 * Opening cap $4,000 and graduation cap $35,000 (same as the Solana launchpad).
 *
 * With r² = graduation / opening:
 *   virtualToken = S · r² / (r² − 1)
 *   curveSupply  = virtualToken · (r − 1) / r        (sold on the curve)
 *   LP tokens    = S − curveSupply                   (seeded into Uniswap at the final price)
 *   virtualNative = virtualToken · openingCap / (1e9 · nativeUsd)
 */
export const SUPPLY = 10n ** 27n;
export const OPENING_CAP_USD = 4_000;
export const GRADUATION_CAP_USD = 35_000;

export function curveParams(nativeUsd: number, openingUsd = OPENING_CAP_USD, graduationUsd = GRADUATION_CAP_USD) {
  if (!Number.isFinite(nativeUsd) || nativeUsd <= 0) throw new Error('A live USD price for the native coin is required.');
  const r2 = graduationUsd / openingUsd, r = Math.sqrt(r2);
  const virtualToken = (SUPPLY * BigInt(Math.round((r2 / (r2 - 1)) * 1e12))) / 10n ** 12n;
  const curveSupply = (virtualToken * BigInt(Math.round(((r - 1) / r) * 1e12))) / 10n ** 12n;
  const virtualNative = (virtualToken * BigInt(Math.round((openingUsd / nativeUsd) * 1e9))) / (10n ** 9n * 10n ** 9n);
  const raisedNative = Number(virtualNative) / 1e18 * (r - 1);
  return { virtualNative, virtualToken, curveSupply, raisedNative, raisedUsd: raisedNative * nativeUsd };
}
