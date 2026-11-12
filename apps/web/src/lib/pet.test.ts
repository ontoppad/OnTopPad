import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_SPRITES, petOf, pixels, spriteOf } from "./pet.ts";

test("every sprite is a clean rectangle of known colours that fits the 16×16 grid", () => {
  for (const rows of ALL_SPRITES) {
    assert.ok(rows.length <= 16);
    for (const r of rows) {
      assert.equal(r.length, rows[0]!.length, `ragged row "${r}"`);
      assert.ok(r.length <= 16);
      assert.match(r, /^[.kbdlwepaAy]+$/);
    }
  }
});

test("a token always hatches the same pet, whatever the address casing", () => {
  const a = petOf("0xAbC0000000000000000000000000000000000001");
  assert.deepEqual(a, petOf("0xabc0000000000000000000000000000000000001"));
  const px = pixels(spriteOf(a.species, "legend"), a.colors);
  assert.ok(px.every((p) => p.x >= 0 && p.x + p.w <= 16 && p.y >= 0 && p.y < 16 && !p.c.includes("f0f")));
  assert.equal(Math.max(...px.map((p) => p.y)), 15); // stands on the bottom row
});
