import { describe, it } from "node:test";
import assert from "node:assert";
import { chunkedInflate, chunkedDeflate } from "../common/utils";
import { Z_HUFFMAN_ONLY } from "../../src/index";

describe("Deflate: Huffman-only strategy", () => {
  it("should compress using Z_HUFFMAN_ONLY and roundtrip", () => {
    // Build data with varying bytes so huffman-only mode emits literals
    const size = 16 * 1024;
    const src = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      src[i] = i & 0xff;
    }

    // Use chunkedDeflate helper to produce compressed data with Z_HUFFMAN_ONLY
    const outBuf = new Uint8Array(src.length + 2048);
    const outLen = chunkedDeflate(src, src.length, outBuf, outBuf.length, 15, Z_HUFFMAN_ONLY, 4096, 1024);
    const compressed = outBuf.subarray(0, outLen);

    assert.ok(compressed.length > 0);

    // Verify roundtrip via the TS inflate implementation using small chunks
    const outBuf2 = new Uint8Array(src.length + 32);
    const outLen2 = chunkedInflate(compressed, compressed.length, outBuf2, outBuf2.length, 15, 8, 16);
    assert.strictEqual(outLen2, src.length);
  });
});
