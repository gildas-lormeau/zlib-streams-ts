import test from "node:test";
import assert from "node:assert";

import {
  createDeflateStream,
  deflateInit2_,
  deflate,
  deflateEnd,
  createInflateStream,
  inflateInit2_,
  inflate,
  inflateEnd,
  deflateSetDictionary,
  deflateGetDictionary,
  Z_NO_FLUSH,
  Z_FINISH,
  Z_OK,
  Z_STREAM_END,
  Z_BUF_ERROR,
} from "../../src/index";

function simpleChunkedDeflate(input: Uint8Array, level: number, wbits = 15): Uint8Array {
  const strm = createDeflateStream();
  const ret = deflateInit2_(strm, level, undefined, wbits, undefined, undefined);
  assert.strictEqual(ret, Z_OK);
  // Provide large output buffer to collect compressed data
  const out = new Uint8Array(input.length + 1024);
  strm.next_in = input;
  strm.next_in_index = 0;
  strm.avail_in = input.length;
  strm.next_out = out;
  strm.next_out_index = 0;
  strm.avail_out = out.length;

  let r: number;
  do {
    r = deflate(strm, Z_FINISH);
    if (r !== Z_OK && r !== Z_STREAM_END) {
      throw new Error(`deflate failed: ${r}`);
    }
  } while (r !== Z_STREAM_END);

  const written = out.length - strm.avail_out;
  deflateEnd(strm);
  return out.subarray(0, written);
}

function simpleInflate(input: Uint8Array, wbits = 15): Uint8Array {
  const strm = createInflateStream();
  const ret = inflateInit2_(strm, wbits);
  assert.strictEqual(ret, Z_OK);
  const out = new Uint8Array(input.length * 3 + 1024);
  strm.next_in = input;
  strm.next_in_index = 0;
  strm.avail_in = input.length;
  strm.next_out = out;
  strm.next_out_index = 0;
  strm.avail_out = out.length;

  let r: number;
  do {
    r = inflate(strm, Z_NO_FLUSH);
    if (r !== Z_OK && r !== Z_STREAM_END) {
      throw new Error(`inflate failed: ${r}`);
    }
  } while (r !== Z_STREAM_END);

  const written = out.length - strm.avail_out;
  inflateEnd(strm);
  return out.subarray(0, written);
}

test("deflate: stored-block roundtrip at level 0", () => {
  // Level 0 should emit stored blocks for repetitive or non-compressed data
  const input = new Uint8Array(40000);
  for (let i = 0; i < input.length; i++) {
    input[i] = i & 0xff;
  }

  const compressed = simpleChunkedDeflate(input, 0, 15);
  const decompressed = simpleInflate(compressed, 15);
  assert.strictEqual(decompressed.length, input.length);
  for (let i = 0; i < input.length; i++) {
    assert.strictEqual(decompressed[i], input[i]);
  }
});

test("deflate: set and get dictionary roundtrip", () => {
  const strm = createDeflateStream();
  const ret = deflateInit2_(strm, 6);
  assert.strictEqual(ret, Z_OK);

  const dict = new Uint8Array([10, 20, 30, 40, 50]);
  const r2 = deflateSetDictionary(strm, dict, dict.length);
  assert.strictEqual(r2, Z_OK);

  const out = new Uint8Array(16);
  const len = { _value: 0 } as { _value: number };
  const r3 = deflateGetDictionary(strm, out, len);
  assert.strictEqual(r3, Z_OK);
  assert.strictEqual(len._value, dict.length);
  for (let i = 0; i < dict.length; i++) {
    assert.strictEqual(out[i], dict[i]);
  }
});

test("deflate: stored-block pending buffer and flush path", () => {
  // Create a small output buffer to force stored block to use pending buffer
  const input = new Uint8Array(2000);
  for (let i = 0; i < input.length; i++) {
    input[i] = (i * 31) & 0xff;
  }

  const strm = createDeflateStream();
  let ret = deflateInit2_(strm, 0, undefined, 15, undefined, undefined); // level 0 => stored
  assert.strictEqual(ret, Z_OK);

  // Make avail_out deliberately small so direct copy isn't possible and pending buffer is used
  const out = new Uint8Array(16);
  strm.next_in = input;
  strm.next_in_index = 0;
  strm.avail_in = input.length;
  strm.next_out = out;
  strm.next_out_index = 0;
  strm.avail_out = out.length;

  // Call deflate once - it should return Z_OK (needs more) because avail_out small
  const r1 = deflate(strm, Z_FINISH);
  assert.ok(r1 === Z_OK || r1 === Z_STREAM_END);

  // Now allocate a large output buffer and flush remaining pending bytes
  const out2 = new Uint8Array(input.length + 1024);
  strm.next_out = out2;
  strm.next_out_index = 0;
  strm.avail_out = out2.length;

  let r2: number;
  do {
    r2 = deflate(strm, Z_FINISH);
  } while (r2 === Z_OK);

  assert.strictEqual(r2, Z_STREAM_END);
  deflateEnd(strm);
});

test("deflate: deflate_fast exits when avail_out == 0", () => {
  // Target the deflate_fast path by using level 1 and a tiny output buffer
  const input = new Uint8Array(1024);
  for (let i = 0; i < input.length; i++) {
    input[i] = i & 0xff;
  }

  const strm = createDeflateStream();
  let ret = deflateInit2_(strm, 1);
  assert.strictEqual(ret, Z_OK);

  // Set tiny output buffer so deflate returns early when avail_out == 0
  const out = new Uint8Array(4);
  strm.next_in = input;
  strm.next_in_index = 0;
  strm.avail_in = input.length;
  strm.next_out = out;
  strm.next_out_index = 0;
  strm.avail_out = out.length;

  const r = deflate(strm, Z_FINISH);
  // Either OK (needs more) or STREAM_END if it happened to finish
  assert.ok(r === Z_OK || r === Z_STREAM_END || r === Z_BUF_ERROR);
  deflateEnd(strm);
});
