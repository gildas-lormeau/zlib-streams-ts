import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";
import { chunkedInflate, assertArraysEqual } from "../common/utils";

// This test aims to force the length Huffman decoding in inffast to take the
// 2nd-level lookup path by creating data that produces longer code lengths.
// We do this by compressing a crafted input with Node's zlib and then
// decompressing with the project's inflate to assert a correct roundtrip.

describe("Inflate: inffast second-level length lookup", () => {
  it("should decode lengths that require 2nd-level table indirection", () => {
    // craft data with variable run lengths to produce a variety of length codes
    const size = 32 * 1024;
    const src = new Uint8Array(size);
    for (let i = 0; i < size; ++i) {
      // create long runs at intervals to generate long length codes
      src[i] = i % 256 < 200 ? 0x55 : 0xaa;
    }

    const compressed = zlib.deflateSync(src, { level: 9 });

    const outBuf = new Uint8Array(size + 64);
    const outLen = chunkedInflate(compressed, compressed.length, outBuf, outBuf.length, 15, 4, 16);
    assert.strictEqual(outLen, size);
    assertArraysEqual(outBuf.subarray(0, outLen), src);
  });
});
