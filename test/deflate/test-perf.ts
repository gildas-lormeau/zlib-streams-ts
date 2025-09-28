import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";

import { chunkedDeflate, assertArraysEqual } from "../common/utils";

describe("Deflate: perf", () => {
  it("should compress various buffer sizes", () => {
    const sizes = [1024 * 1024, 10 * 1024 * 1024, 32 * 1024 * 1024];
    const chunk = 64 * 1024;
    for (let i = 0; i < sizes.length; ++i) {
      const size = sizes[i];
      const data = new Uint8Array(size);
      for (let j = 0; j < size; ++j) {
        data[j] = j % 251;
      }
      const outbuf = Math.floor(size + size / 10 + 1024);
      const comp = new Uint8Array(outbuf);
      let clen: number;
      let decomp: Uint8Array;

      // Deflate (normal)
      clen = chunkedDeflate(data, size, comp, outbuf, 15, zlib.constants.Z_DEFAULT_STRATEGY, chunk, chunk);
      decomp = zlib.inflateSync(comp.subarray(0, clen));
      assert.strictEqual(decomp.length, size);
      assertArraysEqual(decomp, data, "deflate decompressed data differs");

      // Gzip
      clen = chunkedDeflate(data, size, comp, outbuf, 15 + 16, zlib.constants.Z_DEFAULT_STRATEGY, chunk, chunk);
      decomp = zlib.gunzipSync(comp.subarray(0, clen));
      assert.strictEqual(decomp.length, size);
      assertArraysEqual(decomp, data, "gzip decompressed data differs");

      // Raw deflate
      clen = chunkedDeflate(data, size, comp, outbuf, -15, zlib.constants.Z_DEFAULT_STRATEGY, chunk, chunk);
      decomp = zlib.inflateRawSync(comp.subarray(0, clen));
      assert.strictEqual(decomp.length, size);
      assertArraysEqual(decomp, data, "raw deflate decompressed data differs");
    }
  });
});
