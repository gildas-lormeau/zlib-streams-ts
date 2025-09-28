import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";

import {
  createInflateStream,
  inflateInit2_,
  inflate,
  inflateReset,
  inflateEnd,
  Z_NO_FLUSH,
  Z_STREAM_END,
} from "../../src/index";

describe("Inflate: multistream/streaming", () => {
  it("should inflate concatenated compressed streams fed in small chunks", () => {
    const payload1 = new TextEncoder().encode("first payload");
    const payload2 = new TextEncoder().encode("second payload");

    const comp1 = zlib.gzipSync(payload1);
    const comp2 = zlib.gzipSync(payload2);
    const concatenated = new Uint8Array(comp1.length + comp2.length);
    concatenated.set(comp1, 0);
    concatenated.set(comp2, comp1.length);

    // Now feed concatenated bytes in small slices to TS inflate and assert outputs
    const out = new Uint8Array(1024);
    const inf = createInflateStream();
    let ret = inflateInit2_(inf, 15 + 16);
    assert.strictEqual(ret, 0);

    // feed the whole concatenated buffer as avail_in but process in two phases using inflateReset
    inf.next_in = concatenated;
    inf.next_in_index = 0;
    inf.avail_in = concatenated.length;

    inf.next_out = out;
    inf.next_out_index = 0;
    inf.avail_out = out.length;

    // First stream: call inflate repeatedly until it signals STREAM_END
    let code: number;
    do {
      code = inflate(inf, Z_NO_FLUSH);
    } while (code === 0);
    assert.strictEqual(code, Z_STREAM_END);
    const out_a = inf.total_out;

    // Advance input pointer to start of second stream
    const used = inf.total_in;
    inf.next_in = concatenated.subarray(used);
    inf.next_in_index = 0;
    inf.avail_in = concatenated.length - used;

    // Reset inflate state for second stream
    ret = inflateReset(inf);
    assert.strictEqual(ret, 0);

    // Prepare output buffer for second stream
    inf.next_out = out.subarray(out_a);
    inf.next_out_index = 0;
    inf.avail_out = out.length - out_a;

    // Second stream: call inflate until STREAM_END
    do {
      code = inflate(inf, Z_NO_FLUSH);
    } while (code === 0);
    assert.strictEqual(code, Z_STREAM_END);
    const out_b = inf.total_out;

    // Verify outputs
    const decodedA = new TextDecoder().decode(out.subarray(0, out_a));
    const decodedB = new TextDecoder().decode(out.subarray(out_a, out_a + out_b));
    assert.strictEqual(decodedA.toString(), "first payload");
    assert.strictEqual(decodedB.toString(), "second payload");

    ret = inflateEnd(inf);
    assert.strictEqual(ret, 0);
  });
});
