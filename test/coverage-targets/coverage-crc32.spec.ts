import test from "node:test";
import assert from "node:assert";
import { crc32 } from "../../src/mod/common/crc32";

test("crc32: no buffer returns 0", () => {
  assert.strictEqual(crc32(), 0);
});

test("crc32: known vector", () => {
  const data = new TextEncoder().encode("hello");
  const r = crc32(0, data, data.length);
  // Known CRC32 for 'hello' is 0x3610a686
  assert.strictEqual(r, 0x3610a686);
});

test("crc32: len clamp to buffer length", () => {
  const buf = new Uint8Array([1, 2, 3, 4, 5]);
  const r = crc32(0, buf, 1000);
  // Should compute CRC over full buffer and return a 32-bit number
  assert.strictEqual(typeof r, "number");
  assert.ok(r >= 0 && r <= 0xffffffff);
});
