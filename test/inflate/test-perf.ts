import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";

import { chunkedInflate, assertArraysEqual } from "../common/utils";

describe("Inflate: perf", () => {
  it("should decompress various buffer sizes", () => {
    const sizes = [1024 * 1024, 10 * 1024 * 1024, 32 * 1024 * 1024];
    const chunk = 64 * 1024;
    for (let i = 0; i < sizes.length; ++i) {
      const size = sizes[i];
      const data = new Uint8Array(size);
      for (let j = 0; j < size; ++j) {
        data[j] = j % 251;
      }
      const outbuf = Math.floor(size + size / 10 + 1024);

      // Deflate (normal)
      const comp = zlib.deflateSync(data, { level: zlib.constants.Z_BEST_COMPRESSION });
      const decomp = new Uint8Array(outbuf);
      const clen = chunkedInflate(comp, comp.length, decomp, outbuf, 15, chunk, chunk);
      assert.strictEqual(clen, size);
      assertArraysEqual(decomp.subarray(0, clen), data, "inflate decompressed data differs");

      // Gzip
      const comp2 = zlib.gzipSync(data, { level: zlib.constants.Z_BEST_COMPRESSION });
      const decomp2 = new Uint8Array(outbuf);
      const clen2 = chunkedInflate(comp2, comp2.length, decomp2, outbuf, 15 + 16, chunk, chunk);
      assert.strictEqual(clen2, size);
      assertArraysEqual(decomp2.subarray(0, clen2), data, "gunzip decompressed data differs");

      // Raw deflate
      const comp3 = zlib.deflateRawSync(data, { level: zlib.constants.Z_BEST_COMPRESSION });
      const decomp3 = new Uint8Array(outbuf);
      const clen3 = chunkedInflate(comp3, comp3.length, decomp3, outbuf, -15, chunk, chunk);
      assert.strictEqual(clen3, size);
      assertArraysEqual(decomp3.subarray(0, clen3), data, "inflateRaw decompressed data differs");
    }
  });
});
