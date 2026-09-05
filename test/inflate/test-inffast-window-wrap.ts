import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";
import { chunkedInflate, streamingInflate, assertArraysEqual } from "../common/utils";

// inflate_fast is entered from LEN only when have >= 6 and left >= 258, so a test driving the
// codec with output chunks smaller than 258 never reaches it whatever its name says. The cases
// below pair buffers large enough to enter the fast path with a source whose matches straddle
// the window wrap, and go through streamingInflate so the tail of such a match is read back from
// the window rather than from the output buffer being filled.
const CASES = [
  { name: "fresh output buffers, fast path", inChunk: 8192, outSize: 65536 },
  { name: "fresh output buffers, output just above the fast path floor", inChunk: 8192, outSize: 512 },
  { name: "fresh output buffers, input slice below the fast path floor", inChunk: 4, outSize: 65536 },
];

describe("Inflate: inffast window wrap", () => {
  function buildSource(): Uint8Array {
    // repeat a pattern well past the 32K window so matches reach back across the wrap point
    const pattern = new Uint8Array(32);
    for (let i = 0; i < pattern.length; i++) {
      pattern[i] = (i * 13) & 0xff;
    }
    const repeats = 2048;
    const src = new Uint8Array(pattern.length * repeats);
    for (let r = 0, off = 0; r < repeats; r++, off += pattern.length) {
      src.set(pattern, off);
    }
    return src;
  }

  for (const testCase of CASES) {
    it(`should handle copies that read from the sliding window when wnext != 0: ${testCase.name}`, () => {
      const src = buildSource();
      const compressed = zlib.deflateSync(src);
      const output = streamingInflate(compressed, 15, testCase.inChunk, testCase.outSize);
      assert.strictEqual(output.length, src.length);
      assertArraysEqual(output, src);
    });
  }

  it("should handle copies that read from the sliding window when wnext != 0: one output buffer", () => {
    const src = buildSource();
    const compressed = zlib.deflateSync(src);
    const outBuf = new Uint8Array(src.length + 32);
    const outLen = chunkedInflate(compressed, compressed.length, outBuf, outBuf.length, 15, 3, 8);
    assert.strictEqual(outLen, src.length);
    assertArraysEqual(outBuf.subarray(0, outLen), src);
  });

  // a longer text-like corpus, which is what actually reproduced the bug: 233 KB of source text
  // deflated at level 6 and fed as 32K slices into fresh 64K buffers corrupted 41 bytes at 141241
  it("should decode a text corpus through window wraps the same way zlib does", () => {
    const words = ["deflate", "inflate", "window", "distance", "length", "Z_DEFLATED", "stream", "buffer"];
    const parts: string[] = [];
    for (let i = 0; i < 40000; i++) {
      parts.push(words[(i * 7 + (i >> 3)) % words.length]);
    }
    const src = new TextEncoder().encode(parts.join(" "));
    for (const level of [6, 9]) {
      const compressed = zlib.deflateSync(src, { level });
      const output = streamingInflate(compressed, 15, 32768, 65536);
      assertArraysEqual(output, src, `level ${level}`);
    }
  });
});
