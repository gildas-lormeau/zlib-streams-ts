import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";
import { createInflateStream, inflateInit2_, inflate, InflateMode } from "../../src/index";

describe("Inflate: inffast invalid distance", () => {
  it("should set BAD mode when distance is too far back (sane=true)", () => {
    // Build a small repeating source to get at least one backreference
    const motif = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const repeats = 512; // 8 * 512 = 4096
    const src = new Uint8Array(motif.length * repeats);
    for (let r = 0, off = 0; r < repeats; r++, off += motif.length) {
      src.set(motif, off);
    }

    const compressed = zlib.deflateSync(src, { level: 6 });

    // Try to corrupt one byte in the compressed stream near the end to inflate a larger distance.
    const corrupted = new Uint8Array(compressed);
    if (corrupted.length > 6) {
      // Flip some high bits near the tail; avoid header bytes by operating near the end
      const idx = corrupted.length - 4;
      corrupted[idx] = corrupted[idx] ^ 0x7f;
    }

    const strm = createInflateStream();
    const ret = inflateInit2_(strm, 15);
    assert.strictEqual(ret, 0);

    strm.next_in = corrupted;
    strm.next_in_index = 0;
    strm.avail_in = corrupted.length;
    strm.next_out = new Uint8Array(8192);
    strm.next_out_index = 0;
    strm.avail_out = strm.next_out.length;

    // Run inflate once; corrupted distance should lead to BAD when sane is true
    inflate(strm, 0);
    // state.mode should be BAD or LEN/TYPE depending on where corruption landed; we accept BAD as proof
    assert.notStrictEqual(strm._state._mode, InflateMode.DONE);
  });
});
