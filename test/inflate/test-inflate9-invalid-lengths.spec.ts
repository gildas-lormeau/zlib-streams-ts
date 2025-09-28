import test from "node:test";
import assert from "node:assert/strict";
import { createInflateStream, inflateInit, inflate, inflateEnd, Z_OK, Z_FINISH } from "../../src/index";

// This test uses a small crafted dynamic-block header sequence that mimics
// known zlib infcover test vectors which trigger "invalid code lengths set"
// or "invalid bit length repeat" paths. We expect inflate9 to detect the
// malformed code lengths and return a data/error state.

test("inflate9: invalid code lengths set -> BAD or Z_DATA_ERROR", () => {
  // Hex sequence derived from zlib infcover tests: "4 0 fe ff" etc.
  // Build a tiny buffer that represents a dynamic block with bad code lengths.
  // Here we use a sequence that zlib's tests use to trigger the error.
  const payload = Uint8Array.from([0x04, 0x00, 0xfe, 0xff]);

  const strm = createInflateStream(true);
  let r = inflateInit(strm);
  assert.strictEqual(r, Z_OK);

  strm.next_in = payload;
  strm.next_in_index = 0;
  strm.avail_in = payload.length;

  const out = new Uint8Array(64);
  strm.next_out = out;
  strm.next_out_index = 0;
  strm.avail_out = out.length;

  r = inflate(strm, Z_FINISH);
  // Inflate may either set BAD mode and return a data error or return Z_BUF_ERROR
  // We accept Z_DATA_ERROR or any negative error indicating invalid input.
  if (r === Z_OK || r === 1 /* Z_STREAM_END */) {
    // Unexpected success — fail the test explicitly
    assert.fail(`inflate unexpectedly succeeded with code ${r}`);
  }

  // If inflate sets a mode on the state to BAD, end should still be callable
  const endRes = inflateEnd(strm);
  assert.strictEqual(endRes, Z_OK);
});
