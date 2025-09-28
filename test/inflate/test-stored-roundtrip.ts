import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";
import { chunkedInflate } from "../common/utils";

describe("Inflate: stored blocks roundtrip", () => {
  it("inflates a stored (level=0) deflate stream produced by Node", () => {
    const size = 32 * 1024;
    const src = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      src[i] = (i * 131 + 7) & 0xff;
    }

    const comp = zlib.deflateSync(src, { level: 0 });

    const outBuf = new Uint8Array(size + 32);
    const outLen = chunkedInflate(comp, comp.length, outBuf, outBuf.length, 15, 8, 16);
    assert.strictEqual(outLen, size);
    for (let i = 0; i < size; i++) {
      if (outBuf[i] !== src[i]) {
        throw new Error(`mismatch at ${i}`);
      }
    }
  });
});
