import assert from "node:assert";
import * as zlib from "node:zlib";
import { createInflateStream, inflateInit2_, inflate, InflateMode } from "../../src/index";

export default function testInffastTruncatedInput(): void {
  // Create a valid compressed blob then truncate it to test LEN state switch
  const src = new TextEncoder().encode("The quick brown fox jumps over the lazy dog".repeat(20));
  const compressed = zlib.deflateSync(src);

  // Truncate compressed input to make it incomplete
  const trunc = compressed.subarray(0, Math.max(8, Math.floor(compressed.length * 0.6)));

  const strm = createInflateStream();
  const ret = inflateInit2_(strm, 15);
  if (ret !== 0) {
    throw new Error("inflateInit2_ failed");
  }

  strm.next_in = trunc;
  strm.next_in_index = 0;
  strm.avail_in = trunc.length;
  strm.next_out = new Uint8Array(1024);
  strm.next_out_index = 0;
  strm.avail_out = strm.next_out.length;

  // Call inflate; for truncated input, inflate should set state.mode to LEN or BAD or TYPE
  // We assert mode is not DONE (full success)
  inflate(strm, 0);
  assert.notStrictEqual(strm._state._mode, InflateMode.DONE);
}
