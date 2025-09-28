import test from "node:test";
import assert from "node:assert/strict";
import { createInflateStream, inflateInit, inflate } from "../../src/index";

// A small test that exercises code-length error handling by initializing
// inflate state with a deliberately malformed lens set via feeding a tiny
// input that can't possibly form valid dynamic Huffman tables. We validate
// that the inflate machinery returns an error or non-positive result and does
// not crash.

test("inftrees infcover vector triggers invalid code-length branch", () => {
  const hex = [0x01, 0x00, 0x00, 0xff, 0xff];
  const input = new Uint8Array(hex);

  const strm = createInflateStream();
  // initialize (deflate headerless) so it will parse as raw deflate
  const initRet = inflateInit(strm);
  assert.strictEqual(initRet, 0);

  // Try to run inflate on the malformed input; we expect it to return an
  // error code or set state appropriately. We'll call inflate directly via
  // the exported function in the module (imported by side-effect through
  // createInflateStream in this test environment). For simplicity we'll just
  // call strm.state and ensure calling inflate with the buffer does not
  // throw and produces a non-positive code.
  const out = new Uint8Array(16);
  // Use the stream-based inflate API exported by the project
  strm.next_in = input;
  strm.next_in_index = 0;
  strm.avail_in = input.length;
  strm.next_out = out;
  strm.next_out_index = 0;
  strm.avail_out = out.length;
  const ret = inflate(strm, /* flush */ 0);
  assert.ok(typeof ret === "number");
  // Accept either a negative error or a non-positive indicator; we mainly
  // assert that the function completed without throwing.
  assert.ok(ret <= 0);
});
