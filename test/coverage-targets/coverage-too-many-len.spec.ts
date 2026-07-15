import assert from "node:assert";
import { createInflateStream, inflate, inflateInit2_, Z_DATA_ERROR, Z_FINISH } from "../../src/index";

// This test crafts a dynamic block header that declares too many literal/length or distance
// symbols to trigger the branch that sets state.mode = InflateMode.BAD and produces the
// "too many length or distance symbols" message.  The bitstream contains the 3 block header
// bits (BFINAL=1, BTYPE=dynamic) followed by the 14 bits read in TABLE: 5 bits for nlen-257,
// 5 bits for ndist-1, 4 bits for ncode-4.

function makeTableHeader(nlen: number, ndist: number, ncode: number): Uint8Array {
  const val = 1 | (2 << 1) | (((nlen - 257) & 0x1f) << 3) | (((ndist - 1) & 0x1f) << 8) | (((ncode - 4) & 0xf) << 13);
  return new Uint8Array([val & 0xff, (val >>> 8) & 0xff, (val >>> 16) & 0xff]);
}

function runInflate(buf: Uint8Array, deflate64: boolean): number {
  const s = createInflateStream();
  s.next_in = buf;
  s.next_in_index = 0;
  s.avail_in = buf.length;
  s.next_out = new Uint8Array(10);
  s.next_out_index = 0;
  s.avail_out = s.next_out.length;
  inflateInit2_(s, deflate64 ? -16 : -15);

  return inflate(s, Z_FINISH);
}

// Test case: normal inflate where ndist > 30 should trigger the "too many length or distance symbols" branch
{
  const buf = makeTableHeader(257, 31, 4); // nlen=257, ndist=31 -> ndist>30
  const ret = runInflate(buf, false);
  assert.strictEqual(ret, Z_DATA_ERROR, "inflate should reject ndist > 30 (normal)");
}

// Test case: deflate64 accepts ndist=31 (32 distance codes); the truncated input must not be a data error
{
  const buf = makeTableHeader(257, 31, 4);
  const ret = runInflate(buf, true);
  assert.notStrictEqual(ret, Z_DATA_ERROR, "inflate should accept ndist > 30 (deflate64)");
}

// Test case: deflate64 should still error when nlen > 286
{
  const buf = makeTableHeader(287, 1, 4); // nlen=287 (>286) -> should be flagged as too many length
  const ret = runInflate(buf, true);
  assert.strictEqual(ret, Z_DATA_ERROR, "inflate should reject nlen > 286 (deflate64)");
}

console.log("coverage-too-many-len: OK");
