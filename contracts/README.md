# MochePad EVM contracts

`src/MochePad.sol` is the bonding-curve launchpad used on Elysium (chain 99901) and Robinhood Chain (chain 4663).

- Fixed 1B-supply ERC-20 per launch; no owner, no mint.
- Constant-product curve with virtual reserves, priced in the native coin (HYPE / ETH).
- Opening cap ≈ $4,000, graduation ≈ $35,000 (parameters set from the live native price; see `src/launchpad/evm/params.ts`).
- Fee 1–3% chosen by the creator, split 50/50 creator / platform. Optional launch protection: 10% decaying to the fee over 5 minutes.
- Graduation seeds a Uniswap V2 pair at the curve's final price and burns the LP tokens. Nobody can fund the pair before graduation.
- Owner can only pause new launches, set the treasury and re-price future launches.

**Unaudited.**

```sh
npm install
npm test      # compiles with solc 0.8.24 (EVM paris) and runs the tests against real Uniswap V2 bytecode
npm run build # writes ABI + bytecode to ../src/launchpad/evm/artifacts.json for the website
```

Deploy from the website at `/launchpad/deploy` with your own wallet, then set `PUBLIC_MOCHEPAD_ELYSIUM` / `PUBLIC_MOCHEPAD_ROBINHOOD` in Vercel.
