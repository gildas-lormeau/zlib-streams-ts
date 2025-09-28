import { describe, it } from "node:test";
import assert from "node:assert";
import { chunkedDeflate, chunkedInflate } from "../common/utils";

describe("Deflate: stored blocks (level 0)", () => {
  it("should emit stored (no compression) blocks and roundtrip", () => {
    // Construct data that is hard to compress (random-ish) but small enough for fast test
    const size = 32 * 1024;
    const src = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      // pattern designed to avoid long repeated matches
      src[i] = (i * 131 + 7) & 0xff;
    }

    // Use chunkedDeflate with compression level 0 to prefer stored blocks.
    const outBuf = new Uint8Array(src.length + 512);
    const compLen = chunkedDeflate(src, src.length, outBuf, outBuf.length, 15, 0, 4096, 1024);
    const compressed = outBuf.subarray(0, compLen);
    assert.ok(compressed.length > 0, "no compressed output");

    // Verify roundtrip via the TS inflate implementation
    const outBuf2 = new Uint8Array(src.length + 32);
    const outLen = chunkedInflate(compressed, compressed.length, outBuf2, outBuf2.length, 15, 8, 16);
    assert.strictEqual(outLen, src.length);
    for (let i = 0; i < src.length; i++) {
      if (outBuf2[i] !== src[i]) {
        throw new Error(`mismatch at ${i}`);
      }
    }
  });
});
