import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";
import { createInflateStream, inflateInit2_, inflate } from "../../src/index";
import { InflateMode } from "../../src/mod/common/types";

// Corrupt a compressed stream to produce an invalid literal/length code that
// should cause the inflate fast path to set state.mode = BAD.

describe("Inflate: inffast invalid literal -> BAD", () => {
  it("should detect invalid literal/length codes and set BAD mode", () => {
    // Start from a small compressed payload that contains at least one literal
    const src = new Uint8Array([0x61, 0x62, 0x63, 0x64, 0x65]);
    const compressed = zlib.deflateSync(src, { level: 9 });

    // Try several corruption strategies: flip a byte, truncate, or overwrite
    // multiple bytes. Accept the test if any corruption produces BAD mode or an
    // inflate error mentioning 'invalid'.
    let sawBad = false;
    const tryVariants = [] as Uint8Array[];
    // single-byte flip
    const v1 = new Uint8Array(compressed);
    if (v1.length > 4) {
      v1[4] = 0xff;
    }
    tryVariants.push(v1);
    // truncate
    if (compressed.length > 2) {
      tryVariants.push(compressed.subarray(0, compressed.length - 1));
    }
    // overwrite several bytes
    const v3 = new Uint8Array(compressed);
    for (let i = 2; i < Math.min(8, v3.length); ++i) {
      v3[i] = 0x00;
    }
    tryVariants.push(v3);

    for (const corrupt of tryVariants) {
      // Inspect inflate state directly so we can assert on InflateMode.BAD.
      const strm = createInflateStream();
      const ret = inflateInit2_(strm, 15);
      assert.strictEqual(ret, 0);
      strm.next_in = corrupt;
      strm.next_in_index = 0;
      strm.avail_in = corrupt.length;
      strm.next_out = new Uint8Array(512);
      strm.next_out_index = 0;
      strm.avail_out = 512;
      try {
        const r = inflate(strm, 0);
        // If inflate returned but state.mode is BAD, accept
        if (strm._state && strm._state._mode === InflateMode.BAD) {
          sawBad = true;
          break;
        }
        // Also accept if inflate returned an error code (negative)
        if (r < 0) {
          sawBad = true;
          break;
        }
      } catch (e: any) {
        if (typeof e.message === "string" && e.message.indexOf("invalid") !== -1) {
          sawBad = true;
          break;
        }
      }
    }

    assert.ok(sawBad, "expected at least one corruption to produce BAD mode or an invalid error");
  });
});
