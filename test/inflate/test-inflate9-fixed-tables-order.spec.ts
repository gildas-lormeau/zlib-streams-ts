import { describe, it } from "node:test";
import assert from "node:assert";

import { createInflateStream, inflateInit2_, inflate, inflateEnd, Z_OK, Z_STREAM_END, Z_FINISH } from "../../src/index";

// same vectors as test-inflate9-length-code-285.spec.ts, but decoded in the reverse order: the
// deflate fixed Huffman tables are built first and the deflate64 tables must not reuse them
const INPUT_DEFLATE64 = new Uint8Array([0x4b, 0x1c, 0xfd, 0xff, 0x07, 0xa3, 0xe5, 0x03, 0x00, 0x00]);
const OUTPUT_LENGTH_DEFLATE64 = 1 + 65538 + 1000;

const INPUT_DEFLATE = new Uint8Array([0x4b, 0x1c, 0x05, 0x00]);
const OUTPUT_LENGTH_DEFLATE = 1 + 258;

function inflateAll(input: Uint8Array, deflate64: boolean, outputLength: number): Uint8Array {
  const out = new Uint8Array(outputLength + 1);
  const strm = createInflateStream();
  let ret = inflateInit2_(strm, deflate64 ? -16 : -15);
  assert.strictEqual(ret, Z_OK, `init failed: ${ret}`);
  strm.next_in = input;
  strm.next_out = out;
  strm.avail_in = input.length;
  strm.avail_out = out.length;
  ret = inflate(strm, Z_FINISH);
  assert.strictEqual(ret, Z_STREAM_END, `inflate returned ${ret}: ${strm.msg}`);
  const result = out.subarray(0, strm.total_out);
  ret = inflateEnd(strm);
  assert.strictEqual(ret, Z_OK, `inflateEnd returned ${ret}`);
  return result;
}

function assertContent(output: Uint8Array, length: number): void {
  assert.strictEqual(output.length, length);
  for (let index = 0; index < output.length; index++) {
    assert.strictEqual(output[index], 0x61, `wrong byte at ${index}`);
  }
}

describe("inflate9: fixed Huffman tables built after deflate", () => {
  it("decodes a deflate fixed Huffman block", () => {
    assertContent(inflateAll(INPUT_DEFLATE, false, OUTPUT_LENGTH_DEFLATE), OUTPUT_LENGTH_DEFLATE);
  });

  it("decodes a deflate64 fixed Huffman block afterwards", () => {
    assertContent(inflateAll(INPUT_DEFLATE64, true, OUTPUT_LENGTH_DEFLATE64), OUTPUT_LENGTH_DEFLATE64);
  });
});
