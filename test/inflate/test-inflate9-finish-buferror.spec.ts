import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createInflateStream, inflateInit, inflate, inflateEnd, Z_OK, Z_BUF_ERROR, Z_FINISH } from "../../src/index";

// Ensure calling inflate9 with Z_FINISH when not at the end causes Z_BUF_ERROR
test("inflate9: Z_FINISH before end returns Z_BUF_ERROR", () => {
  const fixture = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../data/10k_lines.deflate64");
  const data = fs.readFileSync(fixture);
  const input = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

  const s = createInflateStream(true);
  let r = inflateInit(s);
  assert.strictEqual(r, Z_OK);

  // Provide only a small portion of the input but ask for Z_FINISH
  const partialLen = Math.min(64, input.length);
  s.next_in = input;
  s.next_in_index = 0;
  s.avail_in = partialLen;

  const out = new Uint8Array(1024);
  s.next_out = out;
  s.next_out_index = 0;
  s.avail_out = out.length;

  r = inflate(s, Z_FINISH);
  // Expect either Z_BUF_ERROR or another non-success code indicating no end reached
  assert.strictEqual(r, Z_BUF_ERROR);

  r = inflateEnd(s);
  assert.strictEqual(r, Z_OK);
});
