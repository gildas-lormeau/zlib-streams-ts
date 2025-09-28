import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";

import { createDeflateStream, deflateInit, deflate, deflateEnd, Z_FINISH, Z_STREAM_END, Z_OK } from "../../src/index";
import { assertArraysEqual } from "../common/utils";

describe("Deflate: basic tests", () => {
  it("should compress a simple string with TS deflate and decompress with Node zlib", () => {
    const input = new TextEncoder().encode("The quick brown fox jumps over the lazy dog.");
    const input_len = input.length;
    const compressed = new Uint8Array(512);
    const decompressed = new Uint8Array(512);

    const def_strm = createDeflateStream();

    let ret = deflateInit(def_strm, 9);
    assert(ret === Z_OK, `deflateInit returned ${ret}`);

    def_strm.next_in = input;
    def_strm.avail_in = input_len;
    def_strm.next_out = compressed;
    def_strm.avail_out = compressed.length;

    // Drain until the stream signals completion (Z_STREAM_END).
    do {
      ret = deflate(def_strm, Z_FINISH);
      if (ret !== Z_OK && ret !== Z_STREAM_END) {
        throw new Error(`deflate error: ${ret}`);
      }
    } while (ret !== Z_STREAM_END);
    const comp_len = def_strm.total_out;
    ret = deflateEnd(def_strm);
    assert(ret === Z_OK, `deflateEnd returned ${ret}`);

    const compressedSlice = compressed.slice(0, comp_len);
    const inflated = zlib.inflateSync(compressedSlice);
    const decomp_len = inflated.length;
    inflated.copy(decompressed, 0, 0, decomp_len);

    assert(decomp_len === input_len, `length mismatch ${decomp_len} != ${input_len}`);
    assertArraysEqual(input, inflated, "decompressed data differs");
  });
});
