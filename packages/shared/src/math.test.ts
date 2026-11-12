import { test } from "node:test";
import assert from "node:assert/strict";
import { feeFor, buyerEdge, startTickForFdv, priceFromTick, deliveryFee, roundGas, potForRound, MIN_POT_WEI, MIN_BONUS_BPS, MAX_BONUS_BPS, SUPPLY } from "./math.ts";
import { tierFor, weightOf, DAY } from "./tiers.ts";

test("feeFor matches the Solidity formula and keeps buyers >= 1% ahead", () => {
  assert.equal(feeFor(300), 19_417);
  assert.equal(feeFor(900), 73_394);
  for (let b = MIN_BONUS_BPS; b <= MAX_BONUS_BPS; b += 50) assert.ok(buyerEdge(b) >= 0.01 - 1e-9);
});

test("deliveryFee refunds the round's gas only while the contract's 2% cap holds", () => {
  const gp = 20_000_000n; // 0.02 gwei, Robinhood Chain mainnet
  const gas = gp * roundGas(5);
  assert.equal(deliveryFee(gp, 5, gas * 49n), gas); // fee is exactly 2% of paid + fee: the contract accepts it
  assert.equal(deliveryFee(gp, 5, gas * 49n - 1n), null); // a wei less paid and it would revert FeeTooHigh
  assert.equal(deliveryFee(0n, 5, 0n), 0n); // testnet-style free rounds still go through
});

test("potForRound is the smallest pot whose round passes the keeper's reserve and the 2% cap", () => {
  const gp = 20_000_000n;
  const need = potForRound(gp, 5);
  const reserve = gp * roundGas(5);
  assert.equal(deliveryFee(gp, 5, need - reserve), reserve); // the pot left after the reserve carries the fee
  assert.equal(deliveryFee(gp, 5, need - reserve - 1n), null);
  assert.equal(potForRound(0n, 5), MIN_POT_WEI); // testnet: only the dust floor
});

test("start tick round-trips to the requested FDV within one tick spacing", () => {
  const tick = startTickForFdv(10, false);
  const fdv = priceFromTick(tick, false) * SUPPLY;
  assert.ok(Math.abs(fdv / 10 - 1) < 0.004, `fdv ${fdv}`);
  assert.equal(tick % 60, 0);
});

test("tiers and weights", () => {
  assert.equal(tierFor(0).mult, 1);
  assert.equal(tierFor(3 * DAY).mult, 1.5);
  assert.equal(tierFor(8 * DAY).mult, 2);
  assert.equal(weightOf([{ amount: 100, since: 0 }, { amount: 100, since: 6 * DAY }], 8 * DAY), 300);
});
