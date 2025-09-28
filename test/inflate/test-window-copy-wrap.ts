import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";
import { chunkedInflate } from "../common/utils";

describe("Inflate: window-copy wrap behavior", () => {
  it("handles backreferences that wrap the sliding window", () => {
    const pattern = new Uint8Array(64);
    for (let i = 0; i < pattern.length; i++) {
      pattern[i] = (i * 13) & 0xff;
    }

    const repeats = 1024; // ~64KiB, forces window rotation
    const size = pattern.length * repeats;
    const src = new Uint8Array(size);
    for (let r = 0, off = 0; r < repeats; r++, off += pattern.length) {
      src.set(pattern, off);
    }

    const comp = zlib.deflateSync(src, { level: 6 });

    const outBuf = new Uint8Array(size + 32);
    // small input chunk size to force streaming and window wrap behavior
    const outLen = chunkedInflate(comp, comp.length, outBuf, outBuf.length, 15, 3, 8);
    assert.strictEqual(outLen, size);
    for (let i = 0; i < size; i++) {
      if (outBuf[i] !== src[i]) {
        throw new Error(`mismatch at ${i}`);
      }
    }
  });
});
