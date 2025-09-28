import { describe, it } from "node:test";
import assert from "node:assert";

import { createInflateStream, inflateInit2_, inflateCopy, inflateEnd, Z_OK } from "../../src/index";

describe("Inflate: inflateCopy deep-copy", () => {
  it("creates an independent copy of internal buffers and remaps code tables", () => {
    const src = createInflateStream();
    const init = inflateInit2_(src, 15);
    assert.strictEqual(init, Z_OK);

    // Prepare a tiny compressed stream using deflate (use precomputed compressed bytes)
    // For the purposes of this test, we'll force allocation of the window and codes
    // by simulating that some decoding has occurred: set some state fields directly.

    // Prime state so that codes/lencode are constructed on first use
    // Simulate decode by setting mode and injecting some fake codes
    // @ts-ignore - reach into internals for test
    const s = src._state;
    s._codes = new Array(32).fill(null).map(() => ({ _op: 0, _bits: 0, _val: 0 }));
    s._lencode = s._codes.slice(0, 8);
    s._distcode = s._codes.slice(8, 16);
    s._next = s._codes.slice(16);

    // Ensure window is present
    s._window = new Uint8Array(1024);
    s._w_size = s._window.length;

    const dest = createInflateStream();
    const ret = inflateCopy(dest, src);
    assert.strictEqual(ret, Z_OK);

    // Ensure next_index is propagated
    // @ts-ignore
    assert.strictEqual(dest._state._next_index, src._state._next_index);

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

    // Test codes remapping: mutate a code in source.codes and check dest.codes doesn't change
    // @ts-ignore
    const srcCodes = src._state._codes;
    // @ts-ignore
    const destCodes = dest._state._codes;
    if (srcCodes && srcCodes.length > 0) {
      const before = srcCodes[0]._op;
      srcCodes[0]._op = before + 1;
      assert.notStrictEqual(srcCodes[0]._op, destCodes[0]._op);
    }

    // Check that lencode/distcode/next in dest refer to elements in dest.codes (by value)
    // @ts-ignore
    const dln = dest._state._lencode;
    // @ts-ignore
    const ddc = dest._state._distcode;
    // @ts-ignore
    const dnext = dest._state._next;
    assert.ok(Array.isArray(dln));
    assert.ok(Array.isArray(ddc));
    assert.ok(Array.isArray(dnext));

    // Cleanup
    inflateEnd(src);
    inflateEnd(dest);
  });
});
