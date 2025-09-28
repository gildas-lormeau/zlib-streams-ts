import { describe, it } from "node:test";
import assert from "node:assert";

import fs from "node:fs";

import { createInflateStream, inflateInit, inflate, inflateEnd, Z_OK, Z_STREAM_END, Z_FINISH } from "../../src/index";

describe("inflate9: decompress test/data/10k_lines.deflate64", () => {
  it("should decompress the deflate64 fixture", () => {
    const data = fs.readFileSync(new URL("../../test/data/10k_lines.deflate64", import.meta.url));
    const input = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    const out = new Uint8Array(1024 * 1024 * 4);

    const strm = createInflateStream(true);

    let ret = inflateInit(strm);
    assert.strictEqual(ret, Z_OK, `inflateInit failed for both 16 and -16: ${ret}`);

    strm.next_in = input;
    strm.next_out = out;
    strm.avail_in = input.length;
    strm.avail_out = out.length;

    // Run inflate until completion or error
    do {
      ret = inflate(strm, Z_FINISH);
      if (ret !== Z_OK && ret !== Z_STREAM_END) {
        throw new Error(`inflate returned unexpected code: ${ret}`);
      }
    } while (ret !== Z_STREAM_END);

    const written = strm.total_out;
    assert.ok(written > 0, `no output produced`);

    ret = inflateEnd(strm);
    assert.strictEqual(ret, Z_OK, `inflateEnd returned ${ret}`);
  });
});
