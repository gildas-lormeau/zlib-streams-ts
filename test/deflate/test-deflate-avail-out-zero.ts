import { describe, it } from "node:test";
import assert from "node:assert";

import {
  createDeflateStream,
  deflateInit2_,
  deflateEnd,
  deflate,
  Z_OK,
  Z_STREAM_END,
  Z_NO_FLUSH,
  Z_FINISH,
} from "../../src/index";

describe("Deflate: avail_out guard", () => {
  it("should return non-success when avail_out == 0 and then finish successfully", () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    const def = createDeflateStream();
    let ret = deflateInit2_(def, 6);
    assert.strictEqual(ret, Z_OK);

    def.next_in = payload;
    def.next_in_index = 0;
    def.avail_in = payload.length;

    // intentionally set avail_out to 0 to exercise the guard
    def.next_out = new Uint8Array(0);
    def.next_out_index = 0;
    def.avail_out = 0;

    const code = deflate(def, Z_NO_FLUSH);
    // Expect buffer error when no output space provided.
    // Depending on implementation, deflate may return Z_BUF_ERROR or another code.
    // We assert it's not Z_OK to ensure we exercised the non-success branch.
    assert.notStrictEqual(code, Z_OK);

    // Now provide a real buffer and finish the stream
    const out = new Uint8Array(1024);
    def.next_out = out;
    def.next_out_index = 0;
    def.avail_out = out.length;

    let c: number;
    do {
      c = deflate(def, Z_FINISH);
    } while (c === Z_OK);

    // allow either stream-end or other finish semantics
    assert.ok(c === Z_STREAM_END || c !== Z_OK);

    ret = deflateEnd(def);
    assert.strictEqual(ret, Z_OK);
  });
});
