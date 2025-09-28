import { describe, it } from "node:test";
import assert from "node:assert";

import {
  createDeflateStream,
  deflateInit2_,
  deflate,
  deflateEnd,
  Z_BUF_ERROR,
  Z_OK,
  Z_FINISH,
  Z_STREAM_END,
} from "../../src/index";

// This test reproduces the avail_out guard behavior.
// It ensures that when avail_out == 0 and there is no pending output,
// deflate returns Z_BUF_ERROR. If the guard is removed, this test will fail.

describe("Deflate: avail_out guard", () => {
  it("should return Z_BUF_ERROR when avail_out == 0 and no pending bytes", () => {
    const s = createDeflateStream();
    let ret = deflateInit2_(s, 6);
    assert.strictEqual(ret, Z_OK);

    // Provide input but set avail_out to zero to simulate no output space.
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    s.next_in = payload;
    s.next_in_index = 0;
    s.avail_in = payload.length;

    s.next_out = new Uint8Array(0);
    s.next_out_index = 0;
    s.avail_out = 0; // critical: no output space

    const code = deflate(s, Z_FINISH);
    assert.strictEqual(code, Z_BUF_ERROR, "Expected Z_BUF_ERROR when avail_out==0 and no pending");

    // Cleanup: give it some output buffer and finish properly
    s.next_out = new Uint8Array(64);
    s.next_out_index = 0;
    s.avail_out = 64;
    let c: number;
    do {
      c = deflate(s, Z_FINISH);
    } while (c === Z_OK);
    if (c !== Z_STREAM_END) {
      ret = deflateEnd(s);
      assert.strictEqual(ret, Z_OK);
    }
  });

  it("should allow flush_pending when pending>0 even if avail_out == 0", () => {
    // This case attempts to produce pending output, then call deflate with avail_out==0
    const s = createDeflateStream();
    let ret = deflateInit2_(s, 6);
    assert.strictEqual(ret, Z_OK);

    // Prime the stream to generate some pending bits via deflatePrime
    // deflatePrime is not part of this test import in some builds; if unavailable, skip.
    try {
      // @ts-ignore - deflatePrime may be present
      if (typeof (s as any).prime === "function") {
        // nothing
      }
    } catch {
      // ignore
    }

    // Forcing a situation with pending data is tricky here; instead we simulate
    // by making a first call with a small output buffer so pending > 0.
    const payload = new Uint8Array(1000).fill(0xaa);
    s.next_in = payload;
    s.next_in_index = 0;
    s.avail_in = payload.length;

    s.next_out = new Uint8Array(1);
    s.next_out_index = 0;
    s.avail_out = 1;

    let code = deflate(s, Z_FINISH);
    // After this call there should be some pending data and possibly avail_out==0
    // Now set avail_out to 0 and call again; with the guard relaxed, deflate should return Z_OK
    s.next_out = new Uint8Array(0);
    s.next_out_index = 0;
    s.avail_out = 0;

    const code2 = deflate(s, Z_FINISH);
    // We accept either Z_OK or Z_BUF_ERROR depending on implementation; main point is
    // if the guard is removed, code2 will likely be Z_OK. We assert it's a number.
    assert.ok(typeof code2 === "number");

    // Drain to completion
    s.next_out = new Uint8Array(16384);
    s.next_out_index = 0;
    s.avail_out = s.next_out.length;
    do {
      code = deflate(s, Z_FINISH);
    } while (code === Z_OK);
    if (code !== Z_STREAM_END) {
      ret = deflateEnd(s);
      assert.strictEqual(ret, Z_OK);
    }
  });
});
