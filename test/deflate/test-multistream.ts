import { describe, it } from "node:test";
import assert from "node:assert";
import {
  createDeflateStream,
  deflateInit2_,
  deflate,
  deflateEnd,
  Z_FINISH,
  createInflateStream,
  inflateInit2_,
  inflate,
  inflateReset,
  inflateEnd,
  Z_NO_FLUSH,
  Z_STREAM_END,
} from "../../src/index";

describe("Deflate: multistream/streaming (skeleton)", () => {
  it("should handle concatenated streams and partial input", () => {
    // Compress two payloads separately using the TS deflate implementation with gzip wrapper
    const payload1 = new TextEncoder().encode("first payload");
    const payload2 = new TextEncoder().encode("second payload");

    function compressGzip(payload: Uint8Array): Uint8Array {
      const def = createDeflateStream();
      const ret = deflateInit2_(def, 6, undefined, 15 + 16);
      assert.strictEqual(ret, 0);

      def.next_in = payload;
      def.next_in_index = 0;
      def.avail_in = payload.length;

      // start with a moderate output buffer and expand if needed
      let out = new Uint8Array(256);
      def.next_out = out;
      def.next_out_index = 0;
      def.avail_out = out.length;

      let code: number;
      do {
        code = deflate(def, Z_FINISH);
        if (def.avail_out === 0 && code === 0) {
          // expand output buffer
          const more = new Uint8Array(out.length * 2);
          more.set(out, 0);
          out = more;
          def.next_out = out;
          def.next_out_index = def.total_out;
          def.avail_out = out.length - def.next_out_index;
        }
      } while (code === 0);

      // finalize
      const endRet = deflateEnd(def);
      assert.strictEqual(endRet, 0);

      return out.subarray(0, def.total_out);
    }

    const comp1 = compressGzip(payload1);
    const comp2 = compressGzip(payload2);

    const concatenated = new Uint8Array(comp1.length + comp2.length);
    concatenated.set(comp1, 0);
    concatenated.set(comp2, comp1.length);

    // Now feed the concatenated bytes into TS inflate and assert we recover both payloads
    const out = new Uint8Array(1024);
    const inf = createInflateStream();
    let ret = inflateInit2_(inf, 15 + 16);
    assert.strictEqual(ret, 0);

    inf.next_in = concatenated;
    inf.next_in_index = 0;
    inf.avail_in = concatenated.length;

    inf.next_out = out;
    inf.next_out_index = 0;
    inf.avail_out = out.length;

    // First stream
    let code: number;
    do {
      code = inflate(inf, Z_NO_FLUSH);
    } while (code === 0);
    assert.strictEqual(code, Z_STREAM_END);
    const out_a = inf.total_out;

    // Advance input pointer to second stream
    const used = inf.total_in;
    inf.next_in = concatenated.subarray(used);
    inf.next_in_index = 0;
    inf.avail_in = concatenated.length - used;

    ret = inflateReset(inf);
    assert.strictEqual(ret, 0);

    inf.next_out = out.subarray(out_a);
    inf.next_out_index = 0;
    inf.avail_out = out.length - out_a;

    do {
      code = inflate(inf, Z_NO_FLUSH);
    } while (code === 0);
    assert.strictEqual(code, Z_STREAM_END);
    const out_b = inf.total_out;

    const decodedA = new TextDecoder().decode(out.subarray(0, out_a));
    const decodedB = new TextDecoder().decode(out.subarray(out_a, out_a + out_b));
    assert.strictEqual(decodedA, "first payload");
    assert.strictEqual(decodedB, "second payload");

    ret = inflateEnd(inf);
    assert.strictEqual(ret, 0);
  });
});
