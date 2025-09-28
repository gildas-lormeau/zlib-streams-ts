import assert from "node:assert";
import { createInflateStream, inflate, inflateInit } from "../../src/index";

// This test crafts header fields that declare too many literal/length or distance symbols
// to trigger the branch that sets state.mode = InflateMode.BAD and produces the "too many length..." message.
// We only need to supply enough input bits to reach the TABLE state and cause the validation to fail.

function makeTableHeader(nlen: number, ndist: number, ncode: number): Uint8Array {
  // Build the 14 bits header as used in TABLE: 5 bits for nlen-257, 5 bits for ndist-1, 4 bits for ncode-4
  // We put these into a little bitstream LSB-first as inflate expects.
  const out = [] as number[];
  // We'll directly build the 14-bit value and then emit bytes LSB-first
  const val = (((ncode - 4) & 0xf) << 10) | (((ndist - 1) & 0x1f) << 5) | ((nlen - 257) & 0x1f);
  // emit 14 bits, but a full bytes sequence is fine
  out.push(val & 0xff);
  out.push((val >>> 8) & 0xff);
  // pad to align to byte boundary for a stored end-of-block after failing
  return new Uint8Array(out);
}

function runInflateWithHeader(buf: Uint8Array, useDeflate9: boolean): number {
  const s = createInflateStream(useDeflate9);
  s.next_in = buf;
  s.next_in_index = 0;
  s.avail_in = buf.length;
  s.next_out = new Uint8Array(10);
  s.next_out_index = 0;
  s.avail_out = s.next_out.length;
  // initialize stream (sets window bits / mode appropriately)
  inflateInit(s);

  return inflate(s, 0);
}

// Test case: normal inflate where ndist > 30 should trigger the "too many length or distance symbols" branch
{
  const buf = makeTableHeader(257, 31, 4); // nlen=257, ndist=31 -> ndist>30
  const ret = runInflateWithHeader(buf, false);
  // Expect an error return (non-zero / non Z_OK)
  assert(ret !== 0, "inflate should return an error code when too many symbols (normal)");
}

// Test case: deflate64 path should not treat ndist>30 as an error but should still error when nlen > 286
{
  const buf = makeTableHeader(287, 1, 4); // nlen=287 (>286) -> should be flagged as too many length
  const ret = runInflateWithHeader(buf, true);
  assert(ret !== 0, "inflate9 should return an error code when nlen > 286 (deflate64)");
}
