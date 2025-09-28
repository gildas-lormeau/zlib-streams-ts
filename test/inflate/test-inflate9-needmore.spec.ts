import test from "node:test";
import assert from "node:assert/strict";
import { createInflateStream, inflateInit, inflate, inflateEnd, Z_NO_FLUSH } from "../../src/index";

test("inflate9: truncated dynamic-block triggers NeedMoreInput path (no crash)", () => {
  const s = createInflateStream(true);
  let r = inflateInit(s);
  assert.strictEqual(r, 0);

  // Provide no input so the decoder will immediately try to read bits and trigger
  // the NeedMoreInput path inside PULLBYTE/NEEDBITS.
  s.next_in = new Uint8Array(0);
  s.next_in_index = 0;
  s.avail_in = 0;

  const out = new Uint8Array(32);
  s.next_out = out;
  s.next_out_index = 0;
  s.avail_out = out.length;

  r = inflate(s, Z_NO_FLUSH);
  // We expect inflate to return something other than Z_OK (0) when input is empty.
  assert.notStrictEqual(r, 0);

  // cleanup
  const end = inflateEnd(s);
  assert.strictEqual(end, 0);
});
