import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";
import {
  createInflateStream,
  inflateInit2_,
  inflate,
  inflateSetDictionary,
  inflateEnd,
  Z_OK,
  Z_STREAM_END,
  Z_NEED_DICT,
  Z_NO_FLUSH,
} from "../../src/index";
import { assertArraysEqual } from "../common/utils";

// two things the happy path does not reach:
//  - a dictionary whose adler32 has bit 31 set. the DICTID read from the stream went through
//    ZSWAP32, whose shifts produce a signed int, while adler32() returns unsigned, so the
//    equality check in inflateSetDictionary failed for about half of all dictionaries
//  - a dictionary held in a buffer longer than dictLength. updatewindow emulates zlib's end
//    pointer as end.length - copy, so it took the LAST dictLength bytes of the buffer instead
//    of the first, and the window came out filled with the wrong bytes

// adler32 of this text is 0x96bc1a29, which has bit 31 set
const DICTIONARY = new TextEncoder().encode("the quick brown fox jumps over the lazy dog, deflate window dictionary");
const SOURCE = new TextEncoder().encode(
  "the quick brown fox jumps over the lazy dog, deflate window dictionary. ".repeat(200),
);

function inflateWithDictionary(compressed: Uint8Array, dictionary: Uint8Array, dictLength: number): Uint8Array {
  const strm = createInflateStream();
  assert.strictEqual(inflateInit2_(strm, 15), Z_OK);
  const output = new Uint8Array(SOURCE.length + 64);
  strm.next_in = compressed;
  strm.next_in_index = 0;
  strm.avail_in = compressed.length;
  strm.next_out = output;
  strm.next_out_index = 0;
  strm.avail_out = output.length;
  let ret = inflate(strm, Z_NO_FLUSH);
  assert.strictEqual(ret, Z_NEED_DICT, `expected Z_NEED_DICT, got ${ret}`);
  assert.strictEqual(
    inflateSetDictionary(strm, dictionary, dictLength),
    Z_OK,
    "inflateSetDictionary rejected the dictionary",
  );
  ret = inflate(strm, Z_NO_FLUSH);
  assert.strictEqual(ret, Z_STREAM_END, `inflate returned ${ret}: ${strm.msg}`);
  const result = output.slice(0, strm.total_out);
  inflateEnd(strm);
  return result;
}

describe("Inflate: preset dictionary edge cases", () => {
  const compressed = new Uint8Array(zlib.deflateSync(SOURCE, { dictionary: Buffer.from(DICTIONARY), level: 9 }));

  it("accepts a dictionary whose adler32 has the high bit set", () => {
    assertArraysEqual(inflateWithDictionary(compressed, DICTIONARY, DICTIONARY.length), SOURCE);
  });

  it("reads the first dictLength bytes when the dictionary sits in a longer buffer", () => {
    const padded = new Uint8Array(DICTIONARY.length + 40);
    padded.set(DICTIONARY, 0);
    assertArraysEqual(inflateWithDictionary(compressed, padded, DICTIONARY.length), SOURCE);
  });
});
