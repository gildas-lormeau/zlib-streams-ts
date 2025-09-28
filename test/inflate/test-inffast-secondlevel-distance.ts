import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";
import { chunkedInflate, assertArraysEqual } from "../common/utils";

// This test crafts input that encourages use of a wide set of distance codes
// so the inffast distance decoding may perform a 2nd-level lookup.

describe("Inflate: inffast second-level distance lookup", () => {
  it("should decode distances using 2nd-level table indirection", () => {
    const block = new Uint8Array(64);
    for (let i = 0; i < block.length; ++i) {
      block[i] = (i * 37) & 0xff;
    }

    // Build a source that writes block, then repeats with varying distances
    const parts = [] as Uint8Array[];
    parts.push(block);
    for (let i = 0; i < 1024; ++i) {
      // repeat the block but interleave slightly different prefixes to create
      // many different distances when compressed
      const copy = new Uint8Array(block.length);
      copy.set(block);
      copy[0] = i & 0xff;
      parts.push(copy);
    }
    const size = parts.reduce((s, p) => s + p.length, 0);
    const src = new Uint8Array(size);
    let off = 0;
    for (const p of parts) {
      src.set(p, off);
      off += p.length;
    }

    const compressed = zlib.deflateSync(src, { level: 9 });

    const outBuf = new Uint8Array(size + 64);
    const outLen = chunkedInflate(compressed, compressed.length, outBuf, outBuf.length, 15, 5, 16);
    assert.strictEqual(outLen, size);
    assertArraysEqual(outBuf.subarray(0, outLen), src);
  });
});
