import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createInflateStream, inflateInit, inflate, inflateEnd, Z_OK, Z_FINISH } from "../../src/index";

// Ensure updatewindow is exercised: run inflate9 with tiny output buffers and
// assert that the stream state's window gets allocated (w_size > 0)
test("inflate9: updatewindow allocation with small outputs", () => {
  const fixture = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../data/10k_lines.deflate64");
  const data = fs.readFileSync(fixture);
  const input = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

  const s = createInflateStream(true);
  let r = inflateInit(s);
  assert.strictEqual(r, Z_OK);
  s.next_in = input;
  s.next_in_index = 0;
  s.avail_in = input.length;

  // Drive with 1-byte output buffers until stream end
  while (true) {
    const out = new Uint8Array(1);
    s.next_out = out;
    s.next_out_index = 0;
    s.avail_out = out.length;
    const isLast = s.next_in_index >= input.length && s.avail_in === 0;
    r = inflate(s, isLast ? Z_FINISH : /* intermediate */ 0 /* Z_NO_FLUSH */);
    if (r !== Z_OK && r !== 1 /* Z_STREAM_END */) {
      throw new Error(`inflate returned unexpected code: ${r}`);
    }
    if (r === 1) {
      break;
    }
  }

  // After some output, state.window should be allocated
  // access internal state for test
  const state = s._state;
  assert.ok(state._w_size > 0, "window was not allocated");

  r = inflateEnd(s);
  assert.strictEqual(r, Z_OK);
});
