import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";

import { createInflateStream, inflateInit, inflate, inflateEnd, Z_OK, Z_FINISH, Z_STREAM_END } from "../../src/index";
import { assertArraysEqual } from "../common/utils";

describe("Inflate: basic tests", () => {
  it("should decompress with TS inflate a simple string compressed with Node zlib", () => {
    const input = new TextEncoder().encode("The quick brown fox jumps over the lazy dog.");
    const input_len = input.length;
    const decompressed = new Uint8Array(512);

    const deflated = zlib.deflateSync(input);

    const strm = createInflateStream();
    let ret = inflateInit(strm);
    assert(ret === Z_OK, `inflateInit returned ${ret}`);

    strm.next_in = deflated;
    strm.avail_in = deflated.length;
    strm.next_out = decompressed;
    strm.avail_out = decompressed.length;

    // Drain until the stream signals completion (Z_STREAM_END).
    do {
      ret = inflate(strm, Z_FINISH);
      if (ret !== Z_OK && ret !== Z_STREAM_END) {
        throw new Error(`inflate error: ${ret}`);
      }
    } while (ret !== Z_STREAM_END);
    const decomp_len_ts = strm.total_out;

    ret = inflateEnd(strm);
    assert(ret === Z_OK, `inflateEnd returned ${ret}`);

    const inflated = decompressed.subarray(0, decomp_len_ts);

    assert(decomp_len_ts === input_len, `length mismatch ${decomp_len_ts} != ${input_len}`);
    assertArraysEqual(input, inflated, "decompressed data differs");
  });
});
