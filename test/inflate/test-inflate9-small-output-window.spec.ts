import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createInflateStream, inflateInit, inflate, inflateEnd, Z_OK, Z_FINISH } from "../../src/index";

test("inflate9: small output buffers exercise window/updatewindow", () => {
  const fixture = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../data/10k_lines.deflate64");
  const data = fs.readFileSync(fixture);
  const input = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

  // Reference single-shot output
  const one = new Uint8Array(1024 * 1024 * 4);
  const sref = createInflateStream(true);
  let r = inflateInit(sref);
  assert.strictEqual(r, Z_OK);
  sref.next_in = input;
  sref.next_in_index = 0;
  sref.avail_in = input.length;
  sref.next_out = one;
  sref.next_out_index = 0;
  sref.avail_out = one.length;
  do {
    r = inflate(sref, Z_FINISH);
    if (r !== Z_OK && r !== 1 /* Z_STREAM_END */) {
      throw new Error(`unexpected code ${r}`);
    }
  } while (r !== 1);
  const written = one.length - sref.avail_out;
  assert.ok(written > 0);
  const expected = one.subarray(0, written);
  r = inflateEnd(sref);
  assert.strictEqual(r, Z_OK);

  // Now stream with tiny output buffers (1 byte) and full input in one shot
  const s2 = createInflateStream(true);
  r = inflateInit(s2);
  assert.strictEqual(r, Z_OK);
  s2.next_in = input;
  s2.next_in_index = 0;
  s2.avail_in = input.length;

  const collected: number[] = [];
  while (true) {
    const out = new Uint8Array(1); // 1 byte output buffer forces frequent updatewindow
    s2.next_out = out;
    s2.next_out_index = 0;
    s2.avail_out = out.length;
    const isLast = s2.next_in_index >= input.length && s2.avail_in === 0;

    r = inflate(s2, isLast ? Z_FINISH : /* intermediate */ 0 /* Z_NO_FLUSH */);
    if (r !== Z_OK && r !== 1 /* Z_STREAM_END */) {
      throw new Error(`inflate returned unexpected code: ${r}`);
    }
    const wrote = out.length - s2.avail_out;
    for (let i = 0; i < wrote; i++) {
      collected.push(out[i]);
    }
    if (r === 1) {
      break;
    }
    // continue until stream end
  }

  assert.strictEqual(collected.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (collected[i] !== expected[i]) {
      assert.fail(`mismatch at ${i}: expected ${expected[i]} got ${collected[i]}`);
    }
  }

  r = inflateEnd(s2);
  assert.strictEqual(r, Z_OK);
});
