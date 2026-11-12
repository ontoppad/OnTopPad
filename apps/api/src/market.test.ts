import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

process.env.DATA_DIR = mkdtempSync(`${tmpdir()}/ontop-test-`);
const { pickHouse, toTokens } = await import("./market.ts");

const pool = (addr: string, base: string, vol: number, liq = 5000) => ({
  attributes: {
    address: addr,
    base_token_price_usd: "0.0001",
    price_change_percentage: { h24: "12.5" },
    volume_usd: { h24: String(vol) },
    reserve_in_usd: String(liq),
    fdv_usd: "100000",
    market_cap_usd: null,
    transactions: { h24: { buys: 3, sells: 1 } },
    pool_created_at: "2026-11-12T00:00:00Z",
  },
  relationships: { base_token: { data: { id: `robinhood_${base}` } }, dex: { data: { id: "uniswap-v4-robinhood" } } },
});
const tok = (a: string, symbol: string, image_url: string | null = null) => ({ id: `robinhood_${a}`, attributes: { address: a, name: symbol, symbol, image_url } });

test("one row per token, busiest pool wins, quotes and dead pools drop out", () => {
  const rows = toTokens([
    { data: [pool("p1", "0xA", 100), pool("p2", "0xA", 900), pool("p3", "0xW", 5000), pool("p4", "0xB", 50, 0)], included: [tok("0xA", "VOID", "https://x/v.png"), tok("0xW", "WETH")] },
    { data: [pool("p5", "0xC", 300)], included: [tok("0xB", "DEAD"), tok("0xC", "NEW", "missing.png")] },
  ]);
  assert.deepEqual(rows.map((r) => [r.symbol, r.pool]), [["VOID", "p2"], ["NEW", "p5"]]);
  assert.equal(rows[0]!.dex, "uniswap-v4");
  assert.equal(rows[0]!.txns24h, 4);
  assert.equal(rows[1]!.image, null);
});

test("house row: only the pool where $ONTOP is the base token", () => {
  const page = { data: [pool("p1", "0xO", 40), pool("p2", "0xX", 900)], included: [tok("0xO", "ONTOP"), tok("0xX", "PAIRED")] };
  assert.equal(pickHouse(page, "0xo")?.pool, "p1");
  assert.equal(pickHouse(page, "0xZ"), null);
});
