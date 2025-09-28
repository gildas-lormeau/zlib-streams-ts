import { describe, it } from "node:test";
import * as zlib from "node:zlib";
import { chunkedDeflate, assertArraysEqual } from "../common/utils";

describe("Deflate: small buffer edge cases", () => {
  it("should compress with tiny input/output buffers", () => {
    const sizes = [128, 256, 512];
    const chunkSizes = [1, 2, 3, 7, 13, 31];
    for (const size of sizes) {
      for (const chunk of chunkSizes) {
        const data = new Uint8Array(size);
        for (let j = 0; j < size; ++j) {
          data[j] = j % 251;
        }
        const outbuf = size + 32;
        const comp = new Uint8Array(outbuf);
        let clen: number;
        let decomp: Uint8Array;

        // Deflate (normal)
        clen = chunkedDeflate(data, size, comp, outbuf, 15, zlib.constants.Z_DEFAULT_STRATEGY, chunk, chunk);
        decomp = zlib.inflateSync(comp.subarray(0, clen));
        assertArraysEqual(decomp, data, `deflate decompressed data differs (size=${size}, chunk=${chunk})`);

        // Gzip
        clen = chunkedDeflate(data, size, comp, outbuf, 15 + 16, zlib.constants.Z_DEFAULT_STRATEGY, chunk, chunk);
        decomp = zlib.gunzipSync(comp.subarray(0, clen));
        assertArraysEqual(decomp, data, `gzip decompressed data differs (size=${size}, chunk=${chunk})`);

        // Raw deflate
        clen = chunkedDeflate(data, size, comp, outbuf, -15, zlib.constants.Z_DEFAULT_STRATEGY, chunk, chunk);
        decomp = zlib.inflateRawSync(comp.subarray(0, clen));
        assertArraysEqual(decomp, data, `raw deflate decompressed data differs (size=${size}, chunk=${chunk})`);
      }
    }
  });
});
