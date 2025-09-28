import { describe, it } from "node:test";
import assert from "node:assert";
import { createInflateStream } from "../../src/index";
import { inflate_fast } from "../../src/mod/inflate/inffast";

describe("Coverage: inffast targeted branches", () => {
  it("writes expected bytes when op3 >= copyLen (no wrap needed)", () => {
    const strm = createInflateStream();
    const state = strm._state;

    // Setup a window and output similar to the direct test but make op3 >= copyLen
    const wsize = 32;
    state._w_size = wsize;
    state._window = new Uint8Array(wsize);
    for (let i = 0; i < wsize; ++i) {
      state._window[i] = (i * 7) & 0xff;
    }
    state._w_have = wsize;
    state._w_next = 8;

    const out = new Uint8Array(200);
    for (let i = 0; i < out.length; ++i) {
      out[i] = (i * 11) & 0xff;
    }
    strm.next_out = out;

    const dist = 20;
    const len = 5; // short copy so op3 >= copyLen if op2-op3 logic arranged
    const initialOutIndex = dist;
    strm.next_out_index = initialOutIndex;
    const start = 100;
    strm.avail_out = start - 2; // small outMaxDist to make op2 small

    // design lencode/distcode to produce the distance and length
    state._lenbits = 0;
    state._distbits = 0;
    state._lencode = [{ _op: 16, _bits: 0, _val: len }];
    state._distcode = [{ _op: 16, _bits: 0, _val: dist }];

    state._bit_buffer = 0;
    state._bit_count = 15;
    strm.next_in = new Uint8Array(0);
    strm.next_in_index = 0;
    strm.avail_in = 0;

    // Compute expected output following the same logic as the TS impl.
    const outMaxDist = start - strm.avail_out;
    if (dist > outMaxDist) {
      const op2 = dist - outMaxDist;
      let expected: Uint8Array | null = null;
      if (state._w_next === 0) {
        const from_index = state._w_size - op2;
        if (op2 >= len) {
          expected = new Uint8Array(len);
          for (let i = 0; i < len; ++i) {
            expected[i] = state._window[from_index + i];
          }
        }
      } else if (state._w_next < op2) {
        const from_index = state._w_size + state._w_next - op2;
        const op3 = op2 - state._w_next;
        if (op3 >= len) {
          expected = new Uint8Array(len);
          for (let i = 0; i < len; ++i) {
            expected[i] = state._window[from_index + i];
          }
        }
      } else {
        const from_index = state._w_next - op2;
        if (op2 >= len) {
          expected = new Uint8Array(len);
          for (let i = 0; i < len; ++i) {
            expected[i] = state._window[from_index + i];
          }
        }
      }

      // If we computed an expected slice, run and compare
      if (expected) {
        inflate_fast(strm, start);
        const written = strm.next_out_index - initialOutIndex;
        assert.strictEqual(written, len);
        const actual = out.subarray(initialOutIndex, initialOutIndex + len);
        for (let i = 0; i < len; ++i) {
          assert.strictEqual(actual[i], expected[i]);
        }
        return;
      }
    }

    // Fallback: just run inflate_fast and assert something was written
    inflate_fast(strm, start);
    const written = strm.next_out_index - initialOutIndex;
    assert.strictEqual(written, len);
  });

  it("handles op3 < copyLen with later reads from newly written bytes", () => {
    const strm = createInflateStream();
    const state = strm._state;

    const wsize = 64;
    state._w_size = wsize;
    state._window = new Uint8Array(wsize);
    for (let i = 0; i < wsize; ++i) {
      state._window[i] = (i * 13) & 0xff;
    }
    state._w_have = wsize;
    state._w_next = 4;

    const out = new Uint8Array(400);
    for (let i = 0; i < out.length; ++i) {
      out[i] = (i * 5) & 0xff;
    }
    strm.next_out = out;

    const dist = 30;
    const len = 50;
    const initialOutIndex = dist;
    strm.next_out_index = initialOutIndex;
    const start = 200;
    strm.avail_out = start - 10;

    state._lenbits = 0;
    state._distbits = 0;
    state._lencode = [{ _op: 16, _bits: 0, _val: len }];
    state._distcode = [{ _op: 16, _bits: 0, _val: dist }];

    state._bit_buffer = 0;
    state._bit_count = 15;
    strm.next_in = new Uint8Array(0);
    strm.next_in_index = 0;
    strm.avail_in = 0;

    // Simulate expected writes following the op3<copyLen path:
    const outMaxDist = start - strm.avail_out;
    const op2 = dist - outMaxDist;
    const wnextVal = state._w_next;
    const op3 = op2 - wnextVal;
    const simOut = out.slice();
    let writePos = initialOutIndex;
    // copy op3 bytes from window tail
    let from = state._w_size - op3;
    for (let i = 0; i < op3; ++i) {
      simOut[writePos++] = state._window[from++];
    }
    // copy wnext from window[0..wnext-1]
    from = 0;
    for (let i = 0; i < wnextVal; ++i) {
      simOut[writePos++] = state._window[from++];
    }
    // remaining copied from already-written simOut
    let fromOut = writePos - dist;
    while (writePos < initialOutIndex + len) {
      simOut[writePos] = simOut[fromOut];
      writePos++;
      fromOut++;
    }
    const expected = simOut.subarray(initialOutIndex, initialOutIndex + len);

    inflate_fast(strm, start);

    const written = strm.next_out_index - initialOutIndex;
    assert.strictEqual(written, len);
    const actual = out.subarray(initialOutIndex, initialOutIndex + len);
    for (let i = 0; i < len; ++i) {
      assert.strictEqual(actual[i], expected[i], `byte ${i} mismatch`);
    }
  });
});
