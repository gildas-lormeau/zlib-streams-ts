import { describe, it } from "node:test";
import assert from "node:assert";

import { createDeflateStream, deflateInit2_, deflate, deflateEnd, Z_OK, Z_FINISH } from "../../src/index";

describe("Deflate: large flush loops", () => {
  it("should handle many internal flush cycles with tiny output buffers", () => {
    // generate 256KB of patterned data to avoid very long test times
    const size = 256 * 1024;
    const input = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      input[i] = i & 0xff;
    }

    const def = createDeflateStream();
    let ret = deflateInit2_(def, 6);
    assert.strictEqual(ret, Z_OK);

    // feed the whole input in one go
    def.next_in = input;
    def.next_in_index = 0;
    def.avail_in = input.length;

    // use a very small output buffer to force internal flush loops
    const outBuf = new Uint8Array(32);
    def.next_out = outBuf;
    def.next_out_index = 0;
    def.avail_out = outBuf.length;

    const chunks: Uint8Array[] = [];

    let code: number;
    do {
      code = deflate(def, Z_FINISH);
      if (def.next_out_index > 0) {
        chunks.push(outBuf.subarray(0, def.next_out_index));
        // reset output buffer
        def.next_out_index = 0;
        def.avail_out = outBuf.length;
      }
    } while (code === Z_OK);

    // final chunk if any
    if (def.next_out_index > 0) {
      chunks.push(outBuf.subarray(0, def.next_out_index));
    }

    // join compressed chunks
    let totalLen = 0;
    for (const c of chunks) {
      totalLen += c.length;
    }
    const compressed = new Uint8Array(totalLen);
    let off = 0;
    for (const c of chunks) {
      compressed.set(c, off);
      off += c.length;
    }

    // Basic sanity: we produced something
    assert.ok(compressed.length > 0);

    // finalize
    ret = deflateEnd(def);
    assert.strictEqual(ret, Z_OK);
  });
});
