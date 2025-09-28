import { describe, it } from "node:test";
import assert from "node:assert";

import {
  deflateInit,
  deflateEnd,
  deflateReset,
  deflateSetDictionary,
  deflateGetDictionary,
  deflateCopy,
  deflatePrime,
  deflateParams,
  deflateTune,
  deflateBound,
  deflateSetHeader,
  Z_STREAM_ERROR,
} from "../../src/index";

describe("Deflate: error handling", () => {
  it("should return Z_STREAM_ERROR for null/invalid stream parameters", () => {
    // Many zlib APIs return Z_STREAM_ERROR when passed a null stream pointer.
    // Mirror the checks in ref-test/test-errors.c as closely as the TS API permits.

    assert.strictEqual(deflateInit(null as any, 9), Z_STREAM_ERROR);
    assert.strictEqual(deflateEnd(null as any), Z_STREAM_ERROR);
    assert.strictEqual(deflateReset(null as any), Z_STREAM_ERROR);

    // Dictionary getters/setters with null
    assert.strictEqual(deflateSetDictionary(null as any, null as any, 0), Z_STREAM_ERROR);
    assert.strictEqual(deflateGetDictionary(null as any, null as any, null as any), Z_STREAM_ERROR);

    // Copy with null
    assert.strictEqual(deflateCopy(null as any, null as any), Z_STREAM_ERROR);

    // Prime/Params/Tune with null
    assert.strictEqual(deflatePrime(null as any, 1, 1), Z_STREAM_ERROR);
    assert.strictEqual(deflateParams(null as any, 1, 1), Z_STREAM_ERROR);
    assert.strictEqual(deflateTune(null as any, 1, 1, 1, 1), Z_STREAM_ERROR);

    // Advanced utils that accept null or perform no-ops: deflateBound is allowed with null stream in zlib
    // but in our TS port deflateBound expects a stream; call with null to ensure it doesn't throw and returns a number
    // If it returns a number, treat that as acceptable for this test.
    const bound = (deflateBound as any)(null as any, 0);
    assert.strictEqual(typeof bound, "number");

    // Header functions with null
    assert.strictEqual(deflateSetHeader(null as any, null as any), Z_STREAM_ERROR);
  });
});
