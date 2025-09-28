import test from "node:test";
import assert from "node:assert/strict";
import { createInflateStream, inflateInit, inflate, inflateEnd, Z_FINISH } from "../../src/index";

// Create a raw stored block (uncompressed) as per DEFLATE stored-block format:
// - 3 header bits: BFINAL(1 bit) + BTYPE(2 bits=00 for stored)
// - then align to next byte boundary
// - then 16-bit LEN and 16-bit ~LEN
// We'll produce a single stored block containing "ABC" and feed it to inflate9.
test("inflate9: stored block BYTEBITS alignment", () => {
  // Construct block by hand. Use little-endian for LEN fields.
  // Header: not last (0), BTYPE=00 => bits: 000 -> that's one byte 0x00
  // Aligning to byte boundary means we already are on a byte; stored blocks then have LEN/!LEN
  const data = new Uint8Array([0x00, 0x03, 0x00, 0xfc, 0xff, 0x41, 0x42, 0x43]);
  // bytes breakdown:
  // 0x00 - header (BFINAL=0, BTYPE=00) + padding
  // 0x03 0x00 - LEN = 3
  // 0xfc 0xff - NLEN = ~3 = 0xfffc
  // 0x41 0x42 0x43 - 'A' 'B' 'C'

  const s = createInflateStream(true);
  let r = inflateInit(s);
  assert.strictEqual(r, 0);

  s.next_in = data;
  s.next_in_index = 0;
  s.avail_in = data.length;

  const out = new Uint8Array(10);
  s.next_out = out;
  s.next_out_index = 0;
  s.avail_out = out.length;

  r = inflate(s, Z_FINISH);
  // Expect either Z_STREAM_END (1) or Z_OK/other depending on how flush was handled.
  // Assert we produced output matching 'ABC'
  const wrote = out.length - s.avail_out;
  assert.strictEqual(wrote, 3);
  assert.strictEqual(out[0], 0x41);
  assert.strictEqual(out[1], 0x42);
  assert.strictEqual(out[2], 0x43);

  const end = inflateEnd(s);
  assert.strictEqual(end, 0);
});
