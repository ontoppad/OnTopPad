import { test } from "node:test";
import assert from "node:assert/strict";
import { amount, eth, price, usd } from "./format.ts";

test("tiny values keep their magnitude when they round up", () => {
  assert.equal(price(0.00009996), "$0.0001");
  assert.equal(price(0.00001234), "$0.0₄123");
  assert.equal(amount(0.0000099996), "0.0₄1");
  assert.equal(eth(0.0000000171), "0.0₇171 ETH");
});

test("big values switch unit after rounding", () => {
  assert.equal(usd(999_999), "$1.00M");
  assert.equal(usd(999_949), "$999.9K");
  assert.equal(usd(999_999_999), "$1.00B");
  assert.equal(amount(12_345), "12.3K");
});
