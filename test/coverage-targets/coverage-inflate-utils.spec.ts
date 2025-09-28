import test from "node:test";
import assert from "node:assert";

import { createCode, createInvalidCodeMarker, createGzipHeader, ZSWAP32 } from "../../src/mod/inflate/utils";

test("inflate/utils: createCode defaults and fields", () => {
  const c = createCode();
  assert.strictEqual(c._op, 0);
  assert.strictEqual(c._bits, 0);
  assert.strictEqual(c._val, 0);
});

test("inflate/utils: createInvalidCodeMarker and end-of-block markers", () => {
  const m = createInvalidCodeMarker(3);
  assert.strictEqual(m._op, 64);
  assert.strictEqual(m._bits, 3);
});

test("inflate/utils: createGzipHeader returns defaults", () => {
  const h = createGzipHeader({ extra_max: 10, name_max: 5, comm_max: 2 });
  assert.strictEqual(h._done, 0);
  assert.strictEqual(h._extra_max, 10);
  assert.strictEqual(h._name_max, 5);
  assert.strictEqual(h._comm_max, 2);
});

test("inflate/utils: ZSWAP32 byte swaps correctly", () => {
  const v = 0x11223344;
  const swapped = ZSWAP32(v);
  // bytes reversed -> 0x44332211
  assert.strictEqual(swapped >>> 0, 0x44332211);
});
