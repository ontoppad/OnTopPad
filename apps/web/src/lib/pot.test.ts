import { test } from "node:test";
import assert from "node:assert/strict";
import { countdown, potLevel, READY_AT } from "./pot.ts";

test("the mercury fills with the pot, then with the keeper's clock, and never jumps back at the ready mark", () => {
  const now = 1_000_000;
  assert.deepEqual(potLevel(0, 1, now + 100, 900, now), { level: 0, phase: "empty", left: 0 });
  assert.equal(potLevel(0.5, 1, now + 100, 900, now).level, READY_AT / 2);
  // just ready with a full interval to go sits right on the mark
  assert.equal(potLevel(1, 1, now + 900, 900, now).level, READY_AT);
  assert.equal(potLevel(1, 1, now + 900, 900, now).phase, "ready");
  assert.equal(potLevel(1, 1, now + 60, 900, now).phase, "jackpot");
  assert.deepEqual(potLevel(1, 1, now - 5, 900, now), { level: 1, phase: "paying", left: 0 });
  // a clock that stopped long ago falls back to ready instead of paying forever
  assert.equal(potLevel(1, 1, now - 5_000, 900, now).phase, "ready");
});

test("countdown", () => {
  assert.equal(countdown(65), "1:05");
  assert.equal(countdown(3 * 3600 + 20 * 60), "3h 20m");
  assert.equal(countdown(-3), "0:00");
});
