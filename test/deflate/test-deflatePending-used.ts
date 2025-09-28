import { describe, it } from "node:test";
import assert from "node:assert";

import {
  createDeflateStream,
  deflateInit2_,
  deflatePending,
  deflateUsed,
  deflate,
  deflateEnd,
  Z_OK,
  Z_FINISH,
} from "../../src/index";

describe("Deflate: deflatePending and deflateUsed", () => {
  it("reports pending and used bits before and after deflate calls", () => {
    const s = createDeflateStream();
    const init = deflateInit2_(s, 6);
    assert.strictEqual(init, Z_OK);

    // Before doing anything, pending should be zero
    const pending = { _value: -1 };
    const bits = { _value: -1 };
    deflatePending(s, pending, bits);
    assert.strictEqual(pending._value, 0);

    const used = { _value: -1 };
    deflateUsed(s, used);
    assert.strictEqual(used._value, 0);

    // Provide input and run deflate to create pending output
    const payload = new Uint8Array(32).fill(0xaa);
    s.next_in = payload;
    s.next_in_index = 0;
    s.avail_in = payload.length;

    s.next_out = new Uint8Array(16);
    s.next_out_index = 0;
    s.avail_out = s.next_out.length;

    deflate(s, Z_FINISH);

    // Now pending should be >= 0 and used may be >= 0
    deflatePending(s, pending, bits);
    deflateUsed(s, used);
    assert.ok(pending._value >= 0);
    assert.ok(used._value >= 0);

    deflateEnd(s);
  });
});
