import test from "node:test";
import assert from "node:assert/strict";

import {
  createInflateStream,
  inflatePrime,
  inflateSync,
  inflateSyncPoint,
  inflateUndermine,
  inflateValidate,
  inflateMark,
  inflateCodesUsed,
  Z_OK,
  Z_STREAM_ERROR,
  Z_BUF_ERROR,
} from "../../src/index";

// Small unit tests to exercise API parity helpers

test("Inflate: API parity (prime, sync, syncPoint, undermine, validate, mark, codesUsed)", () => {
  // Setup a stream
  const strm = createInflateStream();

  // inflatePrime: invalid stream
  assert.equal(inflatePrime(undefined as any, 1, 1), Z_STREAM_ERROR);

  // inflatePrime: zero bits and negative reset
  assert.equal(inflatePrime(strm, 0, 0), Z_OK);
  // prime negative bits -> resets bit buffer
  assert.equal(inflatePrime(strm, -1, 0), Z_OK);

  // inflateSync & inflateSyncPoint: when no input available and not enough bits
  // Per implementation, inflateSync returns Z_BUF_ERROR if no avail_in and bit_count<8
  assert.equal(inflateSync(strm), Z_BUF_ERROR);

  // inflateSyncPoint should be false (0) by default
  assert.equal(inflateSyncPoint(strm), 0);

  // inflateUndermine: invalid stream
  assert.equal(inflateUndermine(undefined as any, 1), Z_STREAM_ERROR);
  // valid call should set sane flag but returns Z_OK
  assert.equal(inflateUndermine(strm, 1), Z_OK);

  // inflateValidate: invalid stream
  assert.equal(inflateValidate(undefined as any, 1), Z_STREAM_ERROR);
  // valid call should return Z_OK
  assert.equal(inflateValidate(strm, 1), Z_OK);

  // inflateMark: invalid stream
  assert.equal(inflateMark(undefined as any) < 0, true);
  // valid call returns a number (pack of back<<16 | something)
  const mark = inflateMark(strm);
  assert.equal(typeof mark, "number");

  // inflateCodesUsed: invalid stream
  assert.equal(inflateCodesUsed(undefined as any), -1);
  // valid call should return the numeric next_index when present
  // @ts-ignore - reach into internal state for testing parity
  strm._state!._next_index = 42;
  assert.equal(inflateCodesUsed(strm), 42);
});
