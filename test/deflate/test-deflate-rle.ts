import { describe, it } from "node:test";
import assert from "node:assert";
import { chunkedInflate, chunkedDeflate } from "../common/utils";
import { Z_RLE } from "../../src/index";

describe("Deflate: RLE strategy", () => {
  it("should produce a valid compressed stream using Z_RLE", () => {
    // Create data with long runs to exercise RLE
    const size = 64 * 1024;
    const src = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      src[i] = i % 128 < 120 ? 0xaa : i & 0xff;
    }

    // Use chunkedDeflate helper to produce compressed data with Z_RLE
    const outBuf = new Uint8Array(src.length + 1024);
    const compLen = chunkedDeflate(src, src.length, outBuf, outBuf.length, 15, Z_RLE, 4096, 1024);
    const compressed = outBuf.subarray(0, compLen);
    assert.ok(compressed.length > 0, "no compressed output");

    // Verify roundtrip via the TS inflate implementation using small chunks
    const outBuf2 = new Uint8Array(src.length + 32);
    const outLen = chunkedInflate(compressed, compressed.length, outBuf2, outBuf2.length, 15, 8, 16);
    assert.strictEqual(outLen, src.length);
    for (let i = 0; i < src.length; i++) {
      if (outBuf2[i] !== src[i]) {
        throw new Error(`mismatch at ${i}`);
      }
    }

    // no explicit deflateEnd needed when using chunkedDeflate helper
  });
});
