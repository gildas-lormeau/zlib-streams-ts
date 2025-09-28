import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";
import { chunkedInflate, assertArraysEqual } from "../common/utils";

describe("Inflate: small buffer edge cases", () => {
  it("should decompress with tiny input/output buffers", () => {
    const sizes = [128, 256, 512];
    const chunkSizes = [1, 2, 3, 7, 13, 31];
    for (const size of sizes) {
      for (const chunk of chunkSizes) {
        const data = new Uint8Array(size);
        for (let j = 0; j < size; ++j) {
          data[j] = j % 251;
        }
        const outbuf = size + 32;
        let comp: Uint8Array;
        let clen: number;
        let decomp: Uint8Array;

        // Deflate (normal)
        comp = zlib.deflateSync(data, { level: zlib.constants.Z_BEST_COMPRESSION });
        decomp = new Uint8Array(outbuf);
        clen = chunkedInflate(comp, comp.length, decomp, outbuf, 15, chunk, chunk);
        assert.strictEqual(clen, size);
        assertArraysEqual(decomp.subarray(0, clen), data, "inflate decompressed data differs");
      }
    }
  });
});
