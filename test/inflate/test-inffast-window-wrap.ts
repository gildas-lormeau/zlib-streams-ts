import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";
import { chunkedInflate, assertArraysEqual } from "../common/utils";

describe("Inflate: inffast window wrap", () => {
  it("should handle copies that read from the sliding window when wnext != 0", () => {
    // Build a source that first fills the window then produces matches that wrap
    const pattern = new Uint8Array(32);
    for (let i = 0; i < pattern.length; i++) {
      pattern[i] = (i * 13) & 0xff;
    }

    // build a long source: repeat pattern to exceed typical 32K window
    const repeats = 2048; // 32 * 2048 = 65536 bytes (-> forces window wrap behavior)
    const size = pattern.length * repeats;
    const src = new Uint8Array(size);
    for (let r = 0, off = 0; r < repeats; r++, off += pattern.length) {
      src.set(pattern, off);
    }

    const compressed = zlib.deflateSync(src);

    // Inflate using tiny chunks to force streaming and window rotation
    const outBuf = new Uint8Array(size + 32);
    const outLen = chunkedInflate(compressed, compressed.length, outBuf, outBuf.length, 15, 3, 8);
    assert.strictEqual(outLen, size);
    assertArraysEqual(outBuf.subarray(0, outLen), src);
  });
});
