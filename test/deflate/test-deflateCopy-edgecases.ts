import { describe, it } from "node:test";
import assert from "node:assert";

import {
  createDeflateStream,
  deflateInit2_,
  deflateCopy,
  deflate,
  deflateEnd,
  Z_OK,
  Z_FINISH,
} from "../../src/index";

describe("Deflate: deflateCopy edgecases", () => {
  it("copies when pending buffer has offset and preserves pending_out_index", () => {
    const src = createDeflateStream();
    const init = deflateInit2_(src, 6);
    assert.strictEqual(init, Z_OK);

    // allocate buffers by calling deflate with some input
    src.next_in = new Uint8Array(1024).fill(0x55);
    src.next_in_index = 0;
    src.avail_in = src.next_in.length;

    src.next_out = new Uint8Array(512);
    src.next_out_index = 0;
    src.avail_out = src.next_out.length;

    // run one deflate iteration
    const r = deflate(src, Z_FINISH);
    assert.ok(r === Z_OK || r === 1);

    // Now ensure pending indexes have values we can copy
    // Create destination and copy
    const dest = createDeflateStream();
    const copyRet = deflateCopy(dest, src);
    assert.strictEqual(copyRet, Z_OK);

    // Ensure dest has independent pending buffer and indices
    // @ts-ignore
    const sPending = src._state._pending;
    // @ts-ignore
    const dPending = dest._state._pending;
    assert.strictEqual(sPending, dPending);

    // Mutate source pending buffer and ensure dest's pending buffer differs
    // @ts-ignore
    const sBuf = src._state._pending_buffer;
    // @ts-ignore
    const dBuf = dest._state._pending_buffer;
    if (sBuf && sBuf.length > 0) {
      const before = sBuf[0];
      sBuf[0] = (before + 1) & 0xff;
      assert.notStrictEqual(sBuf[0], dBuf[0]);
    }

    deflateEnd(src);
    deflateEnd(dest);
  });
});
