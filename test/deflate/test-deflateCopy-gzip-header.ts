import { describe, it } from "node:test";
import assert from "node:assert";

import {
  createDeflateStream,
  deflateInit2_,
  deflateSetHeader,
  deflateCopy,
  deflate,
  deflateEnd,
  Z_OK,
  Z_FINISH,
} from "../../src/index";

describe("Deflate: deflateCopy preserves gzip header", () => {
  it("copies gzhead fields to the destination stream", () => {
    const src = createDeflateStream();
    const init = deflateInit2_(src, 6, undefined, 15 + 16); // gzip wrapper
    assert.strictEqual(init, Z_OK);

    const header = {
      _text: 1,
      _time: 12345,
      _xflags: 2,
      _os: 3,
      _extra: new Uint8Array([1, 2, 3]),
      _extra_max: 3,
      _extra_len: 3,
      _name: new Uint8Array([65, 66]),
      _name_max: 2,
      _comment: new Uint8Array([67]),
      _comm_max: 1,
      _hcrc: 0,
      _done: 0,
    };

    const sh = deflateSetHeader(src, header);
    assert.strictEqual(sh, Z_OK);

    // allocate internal buffers by doing some deflate work
    const payload = new Uint8Array(32).fill(0x99);
    src.next_in = payload;
    src.next_in_index = 0;
    src.avail_in = payload.length;
    src.next_out = new Uint8Array(16);
    src.next_out_index = 0;
    src.avail_out = src.next_out.length;

    deflate(src, Z_FINISH);

    const dest = createDeflateStream();
    const copyRet = deflateCopy(dest, src);
    assert.strictEqual(copyRet, Z_OK);

    // @ts-ignore runtime check
    const srcHead = src._state._gzhead;
    // @ts-ignore runtime check
    const destHead = dest._state._gzhead;
    assert.ok(srcHead, "src gzhead present");
    assert.ok(destHead, "dest gzhead present");

    // Compare a few fields
    assert.strictEqual(destHead._text, srcHead._text);
    assert.strictEqual(destHead._time, srcHead._time);
    assert.strictEqual(destHead._xflags, srcHead._xflags);
    assert.strictEqual(destHead._os, srcHead._os);

    deflateEnd(src);
    deflateEnd(dest);
  });
});
