import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";
import { chunkedInflate, assertArraysEqual } from "../common/utils";

describe("Inflate: streaming long backrefs", () => {
  it("should inflate data with long backreferences when fed in tiny chunks", () => {
    // Build data with a repeating 64-byte pattern repeated many times to force long distances
    const pattern = new Uint8Array(64);
    for (let i = 0; i < pattern.length; i++) {
      pattern[i] = (i * 37) & 0xff;
    }
    const repeats = 1024; // 64 * 1024 = 64KiB total
    const size = pattern.length * repeats;
    const src = new Uint8Array(size);
    for (let r = 0, off = 0; r < repeats; r++, off += pattern.length) {
      src.set(pattern, off);
    }

    const compressed = zlib.deflateSync(src);

    // Inflate using very small input/output chunk sizes to exercise streaming paths
    const outBuf = new Uint8Array(size + 32);
    const outLen = chunkedInflate(compressed, compressed.length, outBuf, outBuf.length, 15, 1, 16);
    assert.strictEqual(outLen, size);

    // Validate content
    assertArraysEqual(outBuf.subarray(0, outLen), src, "decompressed mismatch");
  });
});
