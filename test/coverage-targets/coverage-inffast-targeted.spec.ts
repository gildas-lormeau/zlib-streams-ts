import test from "node:test";
import assert from "node:assert/strict";
import { createInflateStream, inflateInit2_ } from "../../src/index";
import { inflate_fast } from "../../src/mod/inflate/inffast";
import { InflateMode } from "../../src/mod/common/types";

// Targeted inffast tests using synthetic lcode entries and simple input

test("inffast: emits literals for op==0 entry", () => {
  const strm = createInflateStream();
  inflateInit2_(strm, 15);
  const state: any = strm._state;
  // Setup a tiny lencode table where index 0 is a literal (op=0)
  state._lenbits = 1;
  state._distbits = 1;
  const tableSize = 1 << state._lenbits;
  state._lencode = new Array(tableSize).fill(null).map(() => ({ _op: 0, _bits: 1, _val: 65 }));
  state._distcode = new Array(1 << state._distbits).fill(null).map(() => ({ _op: 64, _bits: 1, _val: 0 }));

  // Provide input bytes so inflate_fast will fill the bit buffer (zeros are fine)
  // Provide input bytes so inflate_fast will fill the bit buffer (zeros are fine)
  strm.next_in = new Uint8Array(32).fill(0);
  strm.next_in_index = 0;
  strm.avail_in = strm.next_in.length;

  const out = new Uint8Array(64);
  strm.next_out = out;
  strm.next_out_index = 0;
  strm.avail_out = out.length;

  const start = 0;
  // Should run without throwing and write some bytes (value 65)
  inflate_fast(strm, start);
  // there should be at least one 65 in output
  const wrote = out.includes(65);
  assert.ok(wrote);
});

test("inffast: end-of-block (op & 32) sets state.mode to TYPE", () => {
  const strm = createInflateStream();
  inflateInit2_(strm, 15);
  const state: any = strm._state;
  state._lenbits = 1;
  state._distbits = 1;
  const tableSize2 = 1 << state._lenbits;
  // create distinct table entries and correct table size
  // use op=96 (32|64) so the code skips the second-level lookup and hits end-of-block
  state._lencode = new Array(tableSize2).fill(null).map(() => ({ _op: 96, _bits: 1, _val: 0 }));
  state._distcode = new Array(1 << state._distbits).fill(null).map(() => ({ _op: 64, _bits: 1, _val: 0 }));

  // small input that will be consumed into the bit buffer
  strm.next_in = new Uint8Array(16).fill(0);
  strm.next_in_index = 0;
  strm.avail_in = strm.next_in.length;

  const out = new Uint8Array(64);
  strm.next_out = out;
  strm.next_out_index = 0;
  strm.avail_out = out.length;

  // ensure bit buffer/count are defined
  state._bit_buffer = state._bit_buffer >>> 0;
  state._bit_count = state._bit_count >>> 0;

  const start = 0;
  inflate_fast(strm, start);
  assert.strictEqual(strm._state._mode, InflateMode.TYPE);
});

test("inffast: invalid code (op & 64) sets BAD mode", () => {
  const strm = createInflateStream();
  inflateInit2_(strm, 15);
  const state: any = strm._state;
  state._lenbits = 1;
  state._distbits = 1;
  const tableSize3 = 1 << state._lenbits;
  state._lencode = new Array(tableSize3).fill(null).map(() => ({ _op: 64, _bits: 1, _val: 0 }));
  state._distcode = new Array(1 << state._distbits).fill(null).map(() => ({ _op: 64, _bits: 1, _val: 0 }));

  strm.next_in = new Uint8Array(16).fill(0);
  strm.next_in_index = 0;
  strm.avail_in = strm.next_in.length;

  const out = new Uint8Array(64);
  strm.next_out = out;
  strm.next_out_index = 0;
  strm.avail_out = out.length;

  state._bit_buffer = state._bit_buffer >>> 0;
  state._bit_count = state._bit_count >>> 0;

  const start = 0;
  inflate_fast(strm, start);
  assert.strictEqual(strm._state._mode, InflateMode.BAD);
});
