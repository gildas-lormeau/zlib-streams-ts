import { describe, it } from "node:test";
import assert from "node:assert";

import {
  createDeflateStream,
  deflateInit2_,
  deflateSetHeader,
  deflate,
  deflateEnd,
  Z_FINISH,
  Z_NO_FLUSH,
  Z_OK,
  Z_STREAM_END,
} from "../../src/index";
import { createInflateStream, inflateInit2_, inflate, inflateGetHeader, Z_NEED_DICT } from "../../src/index";
import { createGzipHeader } from "../../src/mod/inflate/utils";

describe("Deflate: gzip header roundtrip via deflateSetHeader", () => {
  it("should write gzip header fields and allow inflateGetHeader to read them back", () => {
    const def = createDeflateStream();
    let ret = deflateInit2_(def, 6, undefined, 15 + 16); // gzip wrapper
    assert.strictEqual(ret, Z_OK);

    // Build a gzip header with extra, name, comment and hcrc to exercise states
    const nameRaw = new TextEncoder().encode("test-file");
    const commentRaw = new TextEncoder().encode("a comment");
    const extra = new Uint8Array([1, 2, 3, 4]);

    // Use helper to create a properly-formed GzipHeader and then populate
    // buffers with trailing NULs where appropriate (deflate writes name/comment
    // as NUL-terminated strings).
    const header = createGzipHeader({
      extra_max: extra.length,
      name_max: nameRaw.length + 1,
      comm_max: commentRaw.length + 1,
    });
    header._text = 1;
    header._time = 0x12345678;
    header._xflags = 0;
    header._os = 3;
    header._hcrc = 1;
    // extra buffer and length
    header._extra = extra;
    header._extra_len = extra.length;
    // name/comment must be NUL-terminated for deflate to write them correctly
    const name = new Uint8Array(nameRaw.length + 1);
    name.set(nameRaw, 0);
    name[nameRaw.length] = 0;
    header._name = name;
    header._name_max = name.length;
    const comment = new Uint8Array(commentRaw.length + 1);
    comment.set(commentRaw, 0);
    comment[commentRaw.length] = 0;
    header._comment = comment;
    header._comm_max = comment.length;

    ret = deflateSetHeader(def, header);
    assert.strictEqual(ret, Z_OK);

    // Prepare payload
    const payload = new Uint8Array(1024);
    for (let i = 0; i < payload.length; i++) {
      payload[i] = (i * 37) & 0xff;
    }

    // Compress in small chunks to force header-state transitions and flushes
    const outBuf = new Uint8Array(4096);
    let in_pos = 0;
    let out_pos = 0;
    const chunkIn = 32;
    const chunkOut = 64;

    def.next_in = payload;
    def.next_out = outBuf;

    do {
      const this_in = Math.min(chunkIn, payload.length - in_pos);
      def.next_in_index = in_pos;
      def.avail_in = this_in;
      const flush = in_pos + this_in === payload.length ? Z_FINISH : Z_NO_FLUSH;

      do {
        const this_out = Math.min(chunkOut, outBuf.length - out_pos);
        def.next_out_index = out_pos;
        def.avail_out = this_out;
        const code = deflate(def, flush);
        assert.ok(code === Z_OK || code === Z_STREAM_END, `deflate returned ${code}`);
        out_pos += this_out - def.avail_out;
      } while (def.avail_out === 0);

      in_pos += this_in;
    } while (in_pos < payload.length);

    // Finish any remaining output
    for (;;) {
      def.next_out_index = out_pos;
      def.avail_out = chunkOut;
      const code = deflate(def, Z_FINISH);
      if (code === Z_STREAM_END) {
        out_pos += chunkOut - def.avail_out;
        break;
      }
      assert.strictEqual(code, Z_OK);
      out_pos += chunkOut - def.avail_out;
    }

    ret = deflateEnd(def);
    assert.strictEqual(ret, Z_OK);

    const compressed = outBuf.subarray(0, out_pos);
    assert.ok(compressed.length > 0);

    // Use inflate to read back header
    const inf = createInflateStream();
    ret = inflateInit2_(inf, 15 + 16);
    assert.strictEqual(ret, Z_OK);
    inf.next_in = compressed;
    inf.next_in_index = 0;
    inf.avail_in = compressed.length;
    inf.next_out = new Uint8Array(256);
    inf.next_out_index = 0;
    inf.avail_out = 256;

    const outHdr: any = {
      _done: 0,
      _name: new Uint8Array(128),
      _name_max: 128,
      _comment: new Uint8Array(128),
      _comm_max: 128,
      _extra: new Uint8Array(64),
      _extra_max: 64,
    };
    // attach header struct so inflate will populate it while parsing
    ret = inflateGetHeader(inf, outHdr);
    assert.strictEqual(ret, Z_OK);

    let code = Z_OK;
    // run inflate a few times to parse header fields
    for (let i = 0; i < 10; i++) {
      code = inflate(inf, Z_NO_FLUSH);
      if (code === Z_NEED_DICT) {
        assert.fail("inflate unexpectedly requested a preset dictionary");
      }
      if (outHdr.name && outHdr.name.length) {
        break;
      }
      if (code === Z_STREAM_END) {
        break;
      }
    }

    // parsed header available in outHdr

    // Validate some header fields
    // inflate should have parsed the header; done==1 indicates header read
    assert.strictEqual(outHdr._done, 1);
    assert.strictEqual(outHdr._text, 1);
    // header hcrc should be set
    assert.strictEqual(outHdr._hcrc, 1);
    // name and comment should be present as Uint8Array; convert to strings
    function toStr(arr?: Uint8Array): string {
      if (!arr) {
        return "";
      }
      const zero = arr.indexOf(0);
      const end = zero === -1 ? arr.length : zero;
      return new TextDecoder().decode(arr.subarray(0, end));
    }
    assert.strictEqual(toStr(outHdr._name), "test-file");
    assert.strictEqual(toStr(outHdr._comment), "a comment");
    // extra should match up to extra_len
    assert.ok(outHdr._extra && outHdr._extra_len === extra.length);
    for (let i = 0; i < extra.length; i++) {
      assert.strictEqual(outHdr._extra[i], extra[i]);
    }
  });
});
