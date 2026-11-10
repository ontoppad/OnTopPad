import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

process.env.DATA_DIR = mkdtempSync(`${tmpdir()}/ontop-test-`);
const { sniffImage, isPublicHttps, createMetadata, getMetadata, MetaError } = await import("./metadata.ts");

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

test("image sniffing trusts bytes, not names", () => {
  assert.equal(sniffImage(png), "png");
  assert.equal(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  assert.equal(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), "webp");
});

test("foreign metadata fetches refuse internal hosts", () => {
  assert.ok(isPublicHttps("https://ipfs.io/ipfs/abc"));
  assert.ok(!isPublicHttps("http://example.com/meta.json"));
  assert.ok(!isPublicHttps("https://127.0.0.1/meta"));
  assert.ok(!isPublicHttps("https://localhost/meta"));
  assert.ok(!isPublicHttps("https://[::1]/meta"));
  assert.ok(!isPublicHttps("https://printer.local/meta"));
});

test("metadata validation and round trip", () => {
  const { id, meta } = createMetadata({ name: "Arcade Cat", symbol: "$acat", description: "meow", x: "javascript:alert(1)", website: "https://acat.xyz" }, png);
  assert.equal(meta.symbol, "ACAT");
  assert.equal(meta.links.x, undefined);
  assert.equal(meta.links.website, "https://acat.xyz/");
  assert.deepEqual(getMetadata(id), JSON.parse(JSON.stringify(meta)));
  assert.throws(() => createMetadata({ name: "A", symbol: "ACAT" }, png), MetaError);
  assert.throws(() => createMetadata({ name: "Arcade", symbol: "ACAT" }, new Uint8Array([1, 2, 3, 4])), MetaError);
});
