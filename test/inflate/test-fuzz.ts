import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";

import { assertArraysEqual } from "../common/utils";

import { createInflateStream, inflateInit, inflate, inflateEnd, Z_OK, Z_NO_FLUSH, Z_STREAM_END } from "../../src/index";

describe("Inflate: fuzz", () => {
  it("should decompress random data", () => {
    for (let t = 0; t < 100; ++t) {
      const sz = 1024 + Math.floor(Math.random() * (1024 * 32));
      const data = new Uint8Array(sz);
      for (let i = 0; i < sz; ++i) {
        data[i] = Math.floor(Math.random() * 256);
      }
      const comp = zlib.deflateSync(data, { level: zlib.constants.Z_BEST_COMPRESSION });

      const inf = createInflateStream();
      let ret = inflateInit(inf);
      assert.strictEqual(ret, Z_OK);
      inf.next_in = comp;
      inf.avail_in = comp.length;
      const outbuf = new Uint8Array(sz + 128);
      inf.next_out = outbuf;
      inf.avail_out = outbuf.length;
      // Drain until completion (Z_STREAM_END) to match reference semantics.
      do {
        ret = inflate(inf, Z_NO_FLUSH);
        if (ret !== Z_OK && ret !== Z_STREAM_END) {
          throw new Error(`inflate error: ${ret}`);
        }
      } while (ret !== Z_STREAM_END);
      const olen = inf.total_out;
      ret = inflateEnd(inf);
      assert.strictEqual(ret, Z_OK);

      assert.strictEqual(olen, sz);
      assertArraysEqual(outbuf.subarray(0, olen), data, "fuzz decompressed data differs");
    }
  });
});
