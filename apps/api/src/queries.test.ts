import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

process.env.DATA_DIR = mkdtempSync(`${tmpdir()}/ontop-test-`);
const { db } = await import("./db.ts");
const { candles } = await import("./queries.ts");

test("candles of an old, quiet token still run up to now", () => {
  const now = Math.floor(Date.now() / 1000);
  const launched = now - 30 * 86_400;
  db.prepare(
    `INSERT INTO tokens (address, creator, quote, pool_id, name, symbol, metadata_uri, bonus_bps, fee_ppm, start_tick, token_is0,
      start_price, treasury, reserve, supply, price, launched_at, block, tx)
     VALUES ('0xt', '0xc', '0x0', '0xp', 'T', 'T', '', 500, 3000, 0, 1, 1, 0, 0, 1e9, 2, ?, 1, '0x1')`,
  ).run(launched);
  db.prepare("INSERT INTO trades VALUES ('0x2', 0, '0xt', '0xa', 1, 1, 1, 0, 2, 2, ?)").run(now - 4 * 86_400);
  const out = candles("0xt", 60);
  assert.equal(out.at(-1)!.t, Math.floor(now / 60) * 60);
  assert.equal(out.at(-1)!.c, 2);
  assert.equal(out.length, 1_000);
});
