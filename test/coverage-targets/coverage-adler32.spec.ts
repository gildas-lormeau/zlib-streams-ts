import test from "node:test";
import assert from "node:assert";
import { adler32 } from "../../src/mod/common/adler32";

test("adler32: undefined args returns 1", () => {
  assert.strictEqual(adler32(0), 1);
  assert.strictEqual(adler32(123, undefined, undefined), 1);
});

test("adler32: len===1 branch", () => {
  const v = new Uint8Array([5]);
  const r = adler32(0, v, 1);
  assert.strictEqual(r, ((5 << 16) | 5) >>> 0);
});

test("adler32: short len < 16 branch", () => {
  const v = new Uint8Array([1, 2, 3]);
  const r = adler32(0, v, 3);
  // manual compute: adler sequence 1,3,6 sum2 1,4,10 -> (10<<16)|6
  assert.strictEqual(r, ((10 << 16) | 6) >>> 0);
});

test("adler32: large buffer triggers NMAX loop", () => {
  const NMAX = 5552;
  const buf = new Uint8Array(NMAX + 10);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = i & 0xff;
  }
  const r = adler32(1, buf, buf.length);
  assert.strictEqual(typeof r, "number");
  assert.ok(Number.isFinite(r));
  assert.ok(r >= 0 && r <= 0xffffffff);
});
