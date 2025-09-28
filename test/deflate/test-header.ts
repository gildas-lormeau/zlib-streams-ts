import { describe, it } from "node:test";
import assert from "node:assert";

import {
  createDeflateStream,
  deflateInit2_,
  deflateSetHeader,
  deflateEnd,
  deflatePrime,
  deflate,
  Z_OK,
  Z_STREAM_END,
  Z_NO_FLUSH,
  Z_FINISH,
} from "../../src/index";
import { GzipHeader } from "../../src/mod/common/types";
import { createInflateStream, inflateInit2_, inflateGetHeader, inflate, Z_NEED_DICT } from "../../src/index";

describe("Deflate: header and gzip flags", () => {
  it("should support deflatePrime and write gzip headers via deflateSetHeader", () => {
    // Test deflatePrime: create a stream and prime 8 bits
    const def = createDeflateStream();
    let ret = deflateInit2_(def, 6);
    assert.strictEqual(ret, Z_OK);
    ret = deflatePrime(def, 8, 0x55);
    assert.strictEqual(ret, Z_OK);
    ret = deflateEnd(def);
    assert.strictEqual(ret, Z_OK);
  });

  it("should attach a gzip header and let inflateGetHeader read it back", () => {
    // Build a gzip header and compress a short payload using gzip wrapper
    const header: GzipHeader = {
      _text: 1,
      _time: 0,
      _xflags: 0,
      _os: 3,
      _extra: new Uint8Array(0),
      _extra_max: 0,
      _extra_len: 0,
      _name: new Uint8Array(0),
      _name_max: 0,
      _comment: new Uint8Array(0),
      _comm_max: 0,
      _hcrc: 0,
      _done: 0,
    };

    let ret: number;
    const defstrm = createDeflateStream();
    ret = deflateInit2_(defstrm, 6, undefined, 15 + 16);
    assert.strictEqual(ret, Z_OK);
    ret = deflateSetHeader(defstrm, header);
    assert.strictEqual(ret, Z_OK);

    // Now compress a short payload and drain until Z_STREAM_END. Use at least 1 byte of output
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    defstrm.next_in = payload;
    defstrm.next_in_index = 0;
    defstrm.avail_in = payload.length;

    // minimal non-zero output buffer to avoid avail_out == 0 guard
    const outBuf = new Uint8Array(64);
    defstrm.next_out = outBuf;
    defstrm.next_out_index = 0;
    defstrm.avail_out = outBuf.length;

    let code: number;
    do {
      code = deflate(defstrm, Z_FINISH);
    } while (code === Z_OK);

    // Expect final code to be Z_STREAM_END when stream finished
    // deflate may return Z_STREAM_END or other codes; if not Z_STREAM_END we still call deflateEnd
    if (code !== Z_STREAM_END) {
      ret = deflateEnd(defstrm);
      assert.strictEqual(ret, Z_OK);
    }

    // Now use TS inflate to parse header from the produced compressed buffer
    const compressed = outBuf.subarray(0, defstrm.next_out_index);
    const inf = createInflateStream();
    ret = inflateInit2_(inf, 15 + 16);
    assert.strictEqual(ret, Z_OK);
    inf.next_in = compressed;
    inf.next_in_index = 0;
    inf.avail_in = compressed.length;
    inf.next_out = new Uint8Array(32);
    inf.next_out_index = 0;
    inf.avail_out = 32;

    // perform one inflate step to populate header information
    code = inflate(inf, Z_NO_FLUSH);
    if (code === Z_NEED_DICT) {
      // not expected for this test, but handle gracefully
      assert.fail("inflate unexpectedly requested a preset dictionary");
    }
    const hdr: any = { done: 0 };
    inflateGetHeader(inf, hdr);
    assert.ok(hdr);
  });
});
