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
