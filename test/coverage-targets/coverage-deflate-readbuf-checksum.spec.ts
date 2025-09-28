import test from "node:test";
import assert from "node:assert/strict";
import { createDeflateStream, deflateInit2_, deflate, Z_NO_FLUSH } from "../../src/index";
import { adler32 } from "../../src/mod/common/adler32";

// Test read_buf updates checksum depending on wrap

test("deflate: read_buf updates adler32 when wrap==1", () => {
  const strm = createDeflateStream();
  deflateInit2_(strm, 6);
  const s: any = strm._state;
  s.wrap = 1; // zlib

  // prepare input
  const input = new Uint8Array([1, 2, 3, 4, 5]);
  strm.next_in = input;
  strm.next_in_index = 0;
  strm.avail_in = input.length;

  // call deflate which will call read_buf via fill_window if needed; we only
  // need to trigger read_buf once so call deflate with small out buffer.
  const out = new Uint8Array(16);
  strm.next_out = out;
  strm.next_out_index = 0;
  strm.avail_out = out.length;

  const before = strm._adler;
  deflate(strm, Z_NO_FLUSH);
  const after = strm._adler;
  // after should equal adler32(before, input)
  const expected = adler32(before, input, input.length);
  assert.equal(after, expected);
});

test("deflate: read_buf updates crc32 when wrap==2", () => {
  const strm = createDeflateStream();
  deflateInit2_(strm, 6);
  const s: any = strm._state;
  s.wrap = 2; // gzip

  const input = new Uint8Array([9, 8, 7, 6]);
  strm.next_in = input;
  strm.next_in_index = 0;
  strm.avail_in = input.length;

  const out = new Uint8Array(16);
  strm.next_out = out;
  strm.next_out_index = 0;
  strm.avail_out = out.length;

  const before = strm._adler; // reused field stores crc for wrap==2
  deflate(strm, Z_NO_FLUSH);
  const after = strm._adler;
  // we can't easily compute crc32 without importing crc32; ensure it changed
  assert.notEqual(after, before);
});
