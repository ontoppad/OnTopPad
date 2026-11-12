/** Mirrors OnTopLaunchpad constants and pure math so UI quotes match the contracts exactly. */
export const SUPPLY = 1_000_000_000;
export const TREASURY_BPS = 700;
export const MIN_BONUS_BPS = 300;
export const MAX_BONUS_BPS = 900;
export const HOLDERS_BPS = 7_500;
export const CREATOR_BPS = 1_500;
export const PLATFORM_BPS = 1_000;
export const TICK_SPACING = 60;
export const MAX_START_TICK = 690_000;
/** OnTopDistributor.MAX_DELIVERY_BPS: the most a payout round may hand the keeper for its gas. */
export const MAX_DELIVERY_BPS = 200;
/** Gas of one OnTopLaunchpad.collect, measured on testnet (~164k) with headroom. */
export const COLLECT_GAS = 180_000n;

/** Gas of one distribute call: measured on testnet at ~79k plus ~12.9k per recipient, with headroom. */
export const roundGas = (recipients: number) => 85_000n + 13_500n * BigInt(recipients);

/** The keeper's gas refund for one distribute call paying `paid` in total, or null when the contract's 2% cap can't carry it. */
export function deliveryFee(gasPrice: bigint, recipients: number, paid: bigint): bigint | null {
  const fee = gasPrice * roundGas(recipients);
  return fee * 10_000n > (paid + fee) * BigInt(MAX_DELIVERY_BPS) ? null : fee;
}

/** Holders per distribute call. */
export const ROUND_BATCH = 150;
/** The keeper skips any pot smaller than this. */
export const MIN_POT_WEI = 10n ** 12n;

/** Smallest pot a round goes out with: its gas set aside, and that gas inside the 2% cap, so paid ≥ 49 × gas → pot ≥ 50 × gas. */
export function potForRound(gasPrice: bigint, recipients: number): bigint {
  const n = Math.max(1, recipients);
  const gas = roundGas(n) + roundGas(0) * BigInt(Math.ceil(n / ROUND_BATCH) - 1);
  const need = 50n * gasPrice * gas;
  return need > MIN_POT_WEI ? need : MIN_POT_WEI;
}

/** LP fee in ppm for a bonus — same rounding as OnTopLaunchpad.feeFor. */
export function feeFor(bonusBps: number): number {
  const keep = Math.ceil((1_010_000 * 10_000) / (10_000 + bonusBps));
  return 1_000_000 - keep;
}

/** Net edge of a buy at the pre-trade price, e.g. 0.0101 = +1.01%. */
export function buyerEdge(bonusBps: number): number {
  return (1 - feeFor(bonusBps) / 1e6) * (1 + bonusBps / 1e4) - 1;
}

/** Raw pool price (currency1 per currency0) → quote per token in human units. */
export function priceFromSqrt(sqrtPriceX96: bigint, tokenIs0: boolean, tokenDecimals = 18, quoteDecimals = 18): number {
  const s = Number(sqrtPriceX96) / 2 ** 96;
  const p = s * s;
  const scale = 10 ** (tokenDecimals - quoteDecimals);
  return (tokenIs0 ? p : 1 / p) * scale;
}

export function priceFromTick(tick: number, tokenIs0: boolean, tokenDecimals = 18, quoteDecimals = 18): number {
  const p = 1.0001 ** tick;
  return (tokenIs0 ? p : 1 / p) * 10 ** (tokenDecimals - quoteDecimals);
}

/** Start tick (aligned) for a launch FDV denominated in the quote asset. */
export function startTickForFdv(fdv: number, tokenIs0: boolean, tokenDecimals = 18, quoteDecimals = 18): number {
  const quotePerToken = fdv / SUPPLY;
  const raw = quotePerToken / 10 ** (tokenDecimals - quoteDecimals);
  const p = tokenIs0 ? raw : 1 / raw;
  const tick = Math.round(Math.log(p) / Math.log(1.0001) / TICK_SPACING) * TICK_SPACING;
  return Math.max(-MAX_START_TICK, Math.min(MAX_START_TICK, tick));
}
