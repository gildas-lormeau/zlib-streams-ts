import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";
import { chunkedInflate, assertArraysEqual } from "../common/utils";

describe("Inflate: inffast small wnext", () => {
  it("should handle cases where wnext is small and copying spans window boundary", () => {
    // Create data that repeats a small motif so window contains lots of repeated bytes
    const motif = new Uint8Array(16);
    for (let i = 0; i < motif.length; i++) {
      motif[i] = (i * 7 + 3) & 0xff;
    }

    // Build a source ~40KiB which will populate the window and produce matches
    const repeats = 2560; // 16 * 2560 = 40960
    const size = motif.length * repeats;
    const src = new Uint8Array(size);
    for (let r = 0, off = 0; r < repeats; r++, off += motif.length) {
      src.set(motif, off);
    }

    const compressed = zlib.deflateSync(src, { level: 6 });

    // Use chunked inflate with small output chunks to encourage window rotation
    const outBuf = new Uint8Array(size + 32);
    const outLen = chunkedInflate(compressed, compressed.length, outBuf, outBuf.length, 15, 4, 4);
    assert.strictEqual(outLen, size);
    assertArraysEqual(outBuf.subarray(0, outLen), src);
  });
});
