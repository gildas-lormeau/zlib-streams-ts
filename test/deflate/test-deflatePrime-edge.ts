import { describe, it } from "node:test";
import assert from "node:assert";

import { createDeflateStream, deflateInit2_, deflatePrime, Z_OK, Z_BUF_ERROR } from "../../src/index";

describe("Deflate: deflatePrime edge cases", () => {
  it("returns Z_BUF_ERROR when sym_buf lacks space for priming", () => {
    const s = createDeflateStream();
    const init = deflateInit2_(s, 6);
    assert.strictEqual(init, Z_OK);

    // Force sym_buf_index small so the check triggers. sym_buf_index is
    // normally set to lit_bufsize during init; reduce it to simulate low space.
    // @ts-ignore
    s._state._sym_buf_index = 0;

    const ret = deflatePrime(s, 16, 0xffff);
    assert.strictEqual(ret, Z_BUF_ERROR);
  });
});
