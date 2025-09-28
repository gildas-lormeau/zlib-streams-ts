import { describe, it } from "node:test";
import assert from "node:assert";
import { createInflateStream } from "../../src/index";
import { inflate_fast } from "../../src/mod/inflate/inffast";

// This test calls inflate_fast directly with a crafted InflateStream state to
// force the branch where wnext < op2 (wrapped window copy) and where the
// op3 < copyLen path is taken followed by copying wnext bytes.
describe("Inflate: direct inffast wnext < op2", () => {
  it("executes the wrapped-window copy path and produces expected bytes", () => {
    const strm = createInflateStream();
    const state = strm._state;

    // Window parameters
    const wsize = 32768;
    state._w_size = wsize;
    state._window = new Uint8Array(wsize);
    // fill window with distinct pattern
    for (let i = 0; i < wsize; ++i) {
      state._window[i] = (i * 37) & 0xff;
    }
    state._w_have = wsize;
    state._w_next = 10; // small wnext to trigger wnext < op2

    // Prepare output buffer and prefill earlier output so distance references
    // that point before current outIndex have defined values.
    const out = new Uint8Array(5000);
    for (let i = 0; i < out.length; ++i) {
      out[i] = (i * 3) & 0xff;
    }
    strm.next_out = out;

    // Choose distance and length so that op3 < copyLen and wnext < copyLen
    const dist = 200;
    const len = 300; // copy length

    // Place initial outIndex such that outIndex - dist points into prefilled area
    const initialOutIndex = dist; // so outIndex - dist == 0
    strm.next_out_index = initialOutIndex;

    // Set start and avail_out to compute a small outMaxDist = start - avail_out
    const start = 1000;
    strm.avail_out = 995; // start - avail_out = 5 => outMaxDist = 5

    // Configure lcode and dcode to decode to the desired len and dist without
    // consuming any input bits (use zero-bit codes indexed by bitmask 0)
    state._lenbits = 0;
    state._distbits = 0;
    state._lencode = [{ _op: 16, _bits: 0, _val: len }];
    state._distcode = [{ _op: 16, _bits: 0, _val: dist }];

    // Ensure the bit buffer is large enough so inflate_fast won't attempt to
    // read input bytes (we don't need any input for this synthetic case)
    state._bit_buffer = 0;
    state._bit_count = 15;
    strm.next_in = new Uint8Array(0);
    strm.next_in_index = 0;
    strm.avail_in = 0;

    // Simulate expected bytes using the same logic as the TS code for the
    // wnext < op2 branch. We must mutate a simulated output buffer as the
    // inffast code writes window bytes into output and later reads from those
    // written bytes when copying the remainder.
    const outMaxDist = start - strm.avail_out; // 5
    const op2 = dist - outMaxDist; // dist - 5
    const wnextVal = state._w_next;
    const op3 = op2 - wnextVal;
    const simOut = out.slice(); // mutable copy of prefilled output
    let writePos = initialOutIndex;
    // first copy op3 bytes from window starting at wsize - op3
    let from = state._w_size - op3;
    for (let i = 0; i < op3; ++i) {
      simOut[writePos++] = state._window[from++];
    }
    // then copy wnext bytes from window[0..wnext-1]
    from = 0;
    for (let i = 0; i < wnextVal; ++i) {
      simOut[writePos++] = state._window[from++];
    }
    // remaining bytes copied from simOut starting at (writePos) - dist
    let fromOut = writePos - dist;
    while (writePos < initialOutIndex + len) {
      simOut[writePos] = simOut[fromOut];
      writePos++;
      fromOut++;
    }
    const expected = simOut.subarray(initialOutIndex, initialOutIndex + len);

    // Run the fast inflate loop once
    inflate_fast(strm, start);

    // Verify bytes written
    const written = strm.next_out_index - initialOutIndex;
    assert.strictEqual(written, len, "expected len bytes to be written");
    const actual = out.subarray(initialOutIndex, initialOutIndex + len);
    for (let i = 0; i < len; ++i) {
      assert.strictEqual(actual[i], expected[i], `byte ${i} mismatch`);
    }
  });
});
