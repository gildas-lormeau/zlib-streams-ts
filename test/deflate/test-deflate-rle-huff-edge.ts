import { describe, it } from "node:test";
import assert from "node:assert";
import { chunkedDeflate, chunkedInflate } from "../common/utils";
import { Z_RLE, Z_HUFFMAN_ONLY } from "../../src/index";

describe("Deflate: RLE/HUFF edge cases", () => {
  it("should roundtrip small-chunk compressed data for RLE and HUFF under different wrappers", () => {
    const size = 8 * 1024;
    const src = new Uint8Array(size);
    // create data with long runs and some entropy to trigger both strategies
    for (let i = 0; i < size; i++) {
      src[i] = i % 2 === 0 ? 0x41 : i & 0xff;
    }

    const outBuf = new Uint8Array(size + 2048);

    // Test configurations: [wbits, strategy]
    const configs: Array<[number, number]> = [
      [15, Z_RLE], // zlib wrapper (wbits 15)
      [15 + 16, Z_RLE], // gzip wrapper
      [-15, Z_RLE], // raw deflate
      [15, Z_HUFFMAN_ONLY],
      [15 + 16, Z_HUFFMAN_ONLY],
      [-15, Z_HUFFMAN_ONLY],
    ];

    for (const [wbits, strat] of configs) {
      // tiny chunk sizes to stress output buffering and pending flush paths
      const clen = chunkedDeflate(src, src.length, outBuf, outBuf.length, wbits, strat, 7, 13);
      const compressed = outBuf.subarray(0, clen);
      assert.ok(compressed.length > 0, `compressed empty for wbits=${wbits} strat=${strat}`);

      // Inflated length should match original
      const decompBuf = new Uint8Array(size + 16);
      const dlen = chunkedInflate(compressed, compressed.length, decompBuf, decompBuf.length, wbits, 11, 17);
      assert.strictEqual(dlen, size, `roundtrip length mismatch for wbits=${wbits} strat=${strat}`);
      // verify content
      for (let i = 0; i < size; i++) {
        if (decompBuf[i] !== src[i]) {
          throw new Error(`byte mismatch at ${i} for wbits=${wbits} strat=${strat}: ${decompBuf[i]}!=${src[i]}`);
        }
      }
    }
  });
});
