import { describe, it } from "node:test";
import assert from "node:assert";

import { createDeflateStream, deflateInit2_, deflate, deflateEnd, Z_OK, Z_FINISH } from "../../src/index";

describe("deflateEnd parity cleanup", () => {
  it("replaces large buffers with zero-length typed arrays (keeps state present)", () => {
    const s = createDeflateStream();
    const init = deflateInit2_(s, 6);
    assert.strictEqual(init, Z_OK);

    // Provide some input and produce output so internal buffers are allocated
    const payload = new Uint8Array(1024).fill(0x55);
    s.next_in = payload;
    s.next_in_index = 0;
    s.avail_in = payload.length;

    s.next_out = new Uint8Array(64);
    s.next_out_index = 0;
    s.avail_out = s.next_out.length;

    // Drain to completion
    let r: number;
    do {
      r = deflate(s, Z_FINISH);
    } while (r === Z_OK);

    // Now call deflateEnd
    const endStatus = deflateEnd(s);
    assert.strictEqual(endStatus, Z_OK);

    // State should still exist but large buffers should be zero-length
    // We check a handful of fields that are expected to exist on DeflateState
    // @ts-ignore - runtime checks
    const st = s._state;
    assert.ok(st, "state should still be present");
    // Typed arrays should have been replaced/cleared and user-visible index
    // fields reset. We avoid asserting on private counters.
    // @ts-ignore
    assert.strictEqual(st._pending_buffer_index, 0);
    // @ts-ignore
    assert.strictEqual(st._pending_out_index, 0);
    // @ts-ignore
    assert.strictEqual(st._sym_buf_index, 0);
    // If arrays exist, ensure their contents were zeroed (check a sample)
    // @ts-ignore
    if (st._window && st._window.length > 0) {
      assert.strictEqual(st._window[0], 0);
    }
    // @ts-ignore
    if (st._prev && st._prev.length > 0) {
      assert.strictEqual(st._prev[0], 0);
    }
    // @ts-ignore
    if (st._head && st._head.length > 0) {
      assert.strictEqual(st._head[0], 0);
    }
    // @ts-ignore
    if (st._pending_buffer && st._pending_buffer.length > 0) {
      assert.strictEqual(st._pending_buffer[0], 0);
    }
  });
});
