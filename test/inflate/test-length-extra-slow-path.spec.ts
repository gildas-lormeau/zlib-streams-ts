import { describe, it } from "node:test";
import assert from "node:assert";

import {
  createInflateStream,
  inflateInit2_,
  inflate,
  inflateEnd,
  Z_OK,
  Z_STREAM_END,
  Z_FINISH,
  Z_NO_FLUSH,
} from "../../src/index";

// raw deflate stream (fixed Huffman block): literal "a", then a match encoded with the length
// code 285 — length 258 without extra bits in deflate mode — with distance 1; feeding it one byte
// at a time keeps `have` below 6 so every code is decoded by the slow path (never inflate_fast),
// which must read the extra bits count from the low 4 bits of the op only
const INPUT = new Uint8Array([0x4b, 0x1c, 0x05, 0x00]);
const OUTPUT_LENGTH = 1 + 258;

describe("inflate: length extra bits in the slow path", () => {
  it("decodes a deflate fixed Huffman block fed one byte at a time", () => {
    const out = new Uint8Array(OUTPUT_LENGTH + 1);
    const strm = createInflateStream();
    let ret = inflateInit2_(strm, -15);
    assert.strictEqual(ret, Z_OK, `init failed: ${ret}`);
    strm.next_out = out;
    strm.avail_out = out.length;
    for (let index = 0; index < INPUT.length; index++) {
      strm.next_in = INPUT.subarray(index, index + 1);
      strm.next_in_index = 0;
      strm.avail_in = 1;
      ret = inflate(strm, index == INPUT.length - 1 ? Z_FINISH : Z_NO_FLUSH);
      if (index < INPUT.length - 1) {
        assert.strictEqual(ret, Z_OK, `inflate returned ${ret} at byte ${index}: ${strm.msg}`);
      }
    }
    assert.strictEqual(ret, Z_STREAM_END, `inflate returned ${ret}: ${strm.msg}`);
    assert.strictEqual(strm.total_out, OUTPUT_LENGTH);
    for (let index = 0; index < OUTPUT_LENGTH; index++) {
      assert.strictEqual(out[index], 0x61, `wrong byte at ${index}`);
    }
    ret = inflateEnd(strm);
    assert.strictEqual(ret, Z_OK, `inflateEnd returned ${ret}`);
  });
});
