import { describe, it } from "node:test";
import assert from "node:assert";
import { chunkedInflate } from "../common/utils";
import { createDeflateStream, deflateInit2_, deflate, deflateEnd, Z_FINISH, Z_OK } from "../../src/index";

describe("Deflate: slow path long matches", () => {
  it("should take slow path on inputs with many long matches", () => {
    // Build a buffer with large repeated blocks to force long matches
    const block = new Uint8Array(4096);
    for (let i = 0; i < block.length; i++) {
      block[i] = (i * 37) & 0xff;
    }
    const repeats = 16; // total about 64KB data made of repeating block
    const size = block.length * repeats;
    const src = new Uint8Array(size);
    for (let r = 0; r < repeats; r++) {
      src.set(block, r * block.length);
    }

    // Use manual deflate at level 9 to encourage slow path behavior
    const def = createDeflateStream();
    let ret = deflateInit2_(def, 9);
    assert.strictEqual(ret, Z_OK);

    def.next_in = src;
    def.next_in_index = 0;
    def.avail_in = src.length;

    const outBuf = new Uint8Array(64 * 1024);
    def.next_out = outBuf;
    def.next_out_index = 0;
    def.avail_out = outBuf.length;

    const chunks: Uint8Array[] = [];
    let code: number;
    do {
      code = deflate(def, Z_FINISH);
      if (def.next_out_index > 0) {
        chunks.push(outBuf.subarray(0, def.next_out_index));
        def.next_out_index = 0;
        def.avail_out = outBuf.length;
      }
    } while (code === Z_OK);

    if (def.next_out_index > 0) {
      chunks.push(outBuf.subarray(0, def.next_out_index));
    }

    // join compressed chunks
    let total = 0;
    for (const c of chunks) {
      total += c.length;
    }
    const compressed = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      compressed.set(c, off);
      off += c.length;
    }

    assert.ok(compressed.length > 0);
    ret = deflateEnd(def);
    assert.strictEqual(ret, Z_OK);

    // Verify roundtrip via our inflate helper
    const outBuf2 = new Uint8Array(src.length + 32);
    const outLen = chunkedInflate(compressed, compressed.length, outBuf2, outBuf2.length, 15, 8, 16);
    assert.strictEqual(outLen, src.length);
    for (let i = 0; i < src.length; i++) {
      if (outBuf2[i] !== src[i]) {
        throw new Error(`mismatch at ${i}`);
      }
    }
  });
});
