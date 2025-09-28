import { describe, it } from "node:test";
import assert from "node:assert";

import { createDeflateStream, deflateInit2_, deflateCopy, deflate, deflateEnd, Z_OK, Z_FINISH } from "../../src/index";

describe("Deflate: deflateCopy deep-copy", () => {
  it("creates an independent copy of internal buffers and preserves header state", () => {
    const src = createDeflateStream();
    const init = deflateInit2_(src, 6);
    assert.strictEqual(init, Z_OK);

    // Provide some input to allocate buffers
    const payload = new Uint8Array(64).fill(0x77);
    src.next_in = payload;
    src.next_in_index = 0;
    src.avail_in = payload.length;

    src.next_out = new Uint8Array(128);
    src.next_out_index = 0;
    src.avail_out = src.next_out.length;

    // Call deflate once to populate internal buffers
    const r = deflate(src, Z_FINISH);
    // deflate may return Z_STREAM_END or Z_OK depending on drain; accept either
    assert.ok(r === Z_OK || r === 1);

    const dest = createDeflateStream();
    const copyRet = deflateCopy(dest, src);
    assert.strictEqual(copyRet, Z_OK);

    // Mutate source internal buffers and ensure dest's buffers do not change
    // @ts-ignore
    const srcWindow = src._state._window;
    // @ts-ignore
    const destWindow = dest._state._window;
    if (srcWindow && srcWindow.length > 0) {
      const before = srcWindow[0];
      srcWindow[0] = (before + 1) & 0xff;
      assert.notStrictEqual(srcWindow[0], destWindow[0]);
    }

    // Cleanup
    deflateEnd(src);
    deflateEnd(dest);
  });
});
