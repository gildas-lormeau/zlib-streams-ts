import { describe, it } from "node:test";
import assert from "node:assert";

import {
  inflateInit,
  inflateEnd,
  inflateReset,
  inflateSetDictionary,
  inflateGetDictionary,
  inflateGetHeader,
  Z_STREAM_ERROR,
} from "../../src/index";

describe("Inflate: error handling", () => {
  it("should return Z_STREAM_ERROR for null/invalid stream parameters", () => {
    assert.strictEqual(inflateInit(null as any), Z_STREAM_ERROR);
    assert.strictEqual(inflateEnd(null as any), Z_STREAM_ERROR);
    assert.strictEqual(inflateReset(null as any), Z_STREAM_ERROR);

    // Set/Get dictionary with null
    assert.strictEqual(inflateSetDictionary(null as any, null as any, 0), Z_STREAM_ERROR);
    assert.strictEqual(inflateGetDictionary(null as any, null as any, null as any), Z_STREAM_ERROR);

    // Header functions with null
    assert.strictEqual(inflateGetHeader(null as any, null as any), Z_STREAM_ERROR);
  });
});
