import test from "node:test";
import assert from "node:assert/strict";
import { inflateEnd, createInflateStream, inflateInit, Z_OK, Z_STREAM_ERROR } from "../../src/index";

test("inflateEnd: returns Z_OK for valid stream and Z_STREAM_ERROR for invalid", () => {
  const s = createInflateStream(true);
  // initialize stream so state.mode is valid
  const r = inflateInit(s);
  assert.strictEqual(r, Z_OK);
  const ok = inflateEnd(s);
  assert.strictEqual(ok, Z_OK);

  // Call with null-ish to provoke stream error
  // @ts-expect-error intentionally pass invalid arg
  const bad = inflateEnd(null);
  assert.strictEqual(bad, Z_STREAM_ERROR);
});
