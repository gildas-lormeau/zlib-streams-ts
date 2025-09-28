import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";
import { chunkedInflate, assertArraysEqual } from "../common/utils";

// Force the inflate_fast loop to repeatedly refill the bit buffer by feeding
// input one byte at a time. This exercises the NEEDBITS paths and refill logic.

describe("Inflate: inffast hold refill", () => {
  it("should handle repeated NEEDBITS refill patterns when fed 1-byte chunks", () => {
    const size = 64 * 1024;
    const src = new Uint8Array(size);
    for (let i = 0; i < src.length; ++i) {
      src[i] = (i * 17) & 0xff;
    }

    const compressed = zlib.deflateSync(src, { level: 6 });

    const outBuf = new Uint8Array(size + 64);
    // chunkInput = 1 forces the deflate_fast loop to pull bytes one at a time
    const outLen = chunkedInflate(compressed, compressed.length, outBuf, outBuf.length, 15, 1, 64);
    assert.strictEqual(outLen, size);
    assertArraysEqual(outBuf.subarray(0, outLen), src);
  });
});
