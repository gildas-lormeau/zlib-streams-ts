import { describe, it } from "node:test";
import assert from "node:assert";
import { createDeflateStream, deflateInit2_, deflate, deflateEnd, Z_FINISH, Z_OK } from "../../src/index";

describe("Deflate: slow path compression", () => {
  it("should produce compressed output using level 9 and tiny output buffers", () => {
    // Generate repetitive data that benefits from slow (level 9) compression
    const size = 128 * 1024; // 128KB
    const data = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      data[i] = i % 64 === 0 ? 0x55 : data[i - 1] ^ 0x11;
    }

    const def = createDeflateStream();
    let ret = deflateInit2_(def, 9);
    assert.strictEqual(ret, Z_OK);

    def.next_in = data;
    def.next_in_index = 0;
    def.avail_in = data.length;

    const out = new Uint8Array(64); // tiny output buffer to exercise flush loops
    def.next_out = out;
    def.next_out_index = 0;
    def.avail_out = out.length;

    const chunks: Uint8Array[] = [];
    let code: number;
    do {
      code = deflate(def, Z_FINISH);
      if (def.next_out_index > 0) {
        chunks.push(out.subarray(0, def.next_out_index));
        def.next_out_index = 0;
        def.avail_out = out.length;
      }
    } while (code === 0);

    // Ensure we produced compressed data
    let total = 0;
    for (const c of chunks) {
      total += c.length;
    }
    assert.ok(total > 0, "no compressed output");

    ret = deflateEnd(def);
    assert.strictEqual(ret, Z_OK);
  });
});
