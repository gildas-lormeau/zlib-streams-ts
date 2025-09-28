import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";

import { assertArraysEqual } from "../common/utils";

import {
  createDeflateStream,
  deflateInit,
  deflate,
  deflateEnd,
  Z_FINISH,
  Z_OK,
  Z_BEST_COMPRESSION,
  Z_STREAM_END,
} from "../../src/index";

describe("Deflate: fuzz", () => {
  it("should compress random data", () => {
    for (let t = 0; t < 100; ++t) {
      const sz = 1024 + Math.floor(Math.random() * (1024 * 32));
      const data = new Uint8Array(sz);
      for (let i = 0; i < sz; ++i) {
        data[i] = Math.floor(Math.random() * 256);
      }
      const comp = new Uint8Array(sz + 128);

      const def = createDeflateStream();
      let ret = deflateInit(def, Z_BEST_COMPRESSION);
      assert.strictEqual(ret, Z_OK);
      def.next_in = data;
      def.avail_in = sz;
      def.next_out = comp;
      def.avail_out = comp.length;
      // Drain until completion like the reference tests expect.
      do {
        ret = deflate(def, Z_FINISH);
        if (ret !== Z_OK && ret !== Z_STREAM_END) {
          throw new Error(`deflate error: ${ret}`);
        }
      } while (ret !== Z_STREAM_END);
      const clen = def.total_out;
      ret = deflateEnd(def);
      assert.strictEqual(ret, Z_OK);

      const dcomp = zlib.inflateSync(comp.subarray(0, clen));
      assert.strictEqual(dcomp.length, sz);
      assertArraysEqual(dcomp, data, "fuzz decompressed data differs");
    }
  });
});
