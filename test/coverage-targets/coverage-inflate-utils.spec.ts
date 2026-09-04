import test from "node:test";
import assert from "node:assert";

import {
  createCode,
  createInvalidCodeMarker,
  createGzipHeader,
  ZSWAP32,
  codeOp,
  codeBits,
  codeVal,
} from "../../src/mod/inflate/utils";

test("inflate/utils: createCode defaults and fields", () => {
  const c = createCode();
  assert.strictEqual(codeOp(c), 0);
  assert.strictEqual(codeBits(c), 0);
  assert.strictEqual(codeVal(c), 0);
});

test("inflate/utils: createInvalidCodeMarker and end-of-block markers", () => {
  const m = createInvalidCodeMarker(3);
  assert.strictEqual(codeOp(m), 64);
  assert.strictEqual(codeBits(m), 3);
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
  // the result must be unsigned: it is compared against adler32(), which returns unsigned, so a
  // negative value here rejects every dictionary and every check value with bit 31 set
  const highBit = ZSWAP32(0x000000ff);
  assert.strictEqual(highBit, 0xff000000);
  assert.ok(highBit > 0, "ZSWAP32 must not return a negative number");
});
