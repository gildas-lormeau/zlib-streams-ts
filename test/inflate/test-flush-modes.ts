import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";

import { assertArraysEqual } from "../common/utils";

import {
  createInflateStream,
  inflateInit,
  inflate,
  inflateEnd,
  Z_OK,
  Z_FINISH,
  Z_NO_FLUSH,
  Z_STREAM_END,
  Z_FULL_FLUSH,
  Z_STREAM_ERROR,
} from "../../src/index";

const CHUNK = 16;

describe("Inflate: flush-modes", () => {
  it("should perform deflate Z_NO_FLUSH: decompress all input, then finish with Z_FINISH", () => {
    const inputStr = "flush test data for zlib";
    const inputBytes = new TextEncoder().encode(inputStr);
    const input_len = inputBytes.length;
    const comp = zlib.deflateSync(inputBytes);
    const comp_len = comp.length;
    const compBytes = new Uint8Array(comp.buffer, comp.byteOffset, comp.length);
    const outbuf = new Uint8Array(128);

    let flush: number;
    let total = 0;
    const inf = createInflateStream();
    let ret = inflateInit(inf);
    assert.strictEqual(ret, Z_OK);
    inf.next_in = compBytes;
    inf.avail_in = comp_len;
    do {
      do {
        inf.next_out = outbuf;
        inf.next_out_index = total;
        inf.avail_out = 16;
        flush = inf.avail_in === 0 ? Z_NO_FLUSH : Z_NO_FLUSH;
        ret = inflate(inf, flush);
        if (ret !== Z_OK && ret !== Z_STREAM_END) {
          throw new Error(`inflate error: ${ret}`);
        }
        const used = inf.next_out_index - total;
        total += used;
      } while (inf.avail_out === 0);
    } while (flush !== Z_NO_FLUSH && ret !== Z_STREAM_END);
    assert.strictEqual(ret, Z_STREAM_END);
    ret = inflateEnd(inf);
    assert.strictEqual(ret, Z_OK);
    const inflated = new Uint8Array(outbuf.buffer, outbuf.byteOffset, total);
    assert.strictEqual(inflated.length, input_len);
    assertArraysEqual(inflated, inputBytes, "inflated data differs");
  });

  it("should perform inflate Z_SYNC_FLUSH, Z_FULL_FLUSH, Z_BLOCK if available", () => {
    const inputStr = "flush test data for zlib";
    const inputBytes = new TextEncoder().encode(inputStr);
    const input_len = inputBytes.length;
    const comp = zlib.deflateSync(inputBytes, { flush: zlib.constants.Z_SYNC_FLUSH });
    const comp_len = comp.length;
    const compBytes = new Uint8Array(comp.buffer, comp.byteOffset, comp.length);
    const outbuf = new Uint8Array(128);

    let flush: number;
    let total = 0;
    const inf = createInflateStream();
    let ret = inflateInit(inf);
    assert.strictEqual(ret, Z_OK);
    inf.next_in = compBytes;
    inf.avail_in = comp_len;
    do {
      do {
        inf.next_out = outbuf;
        inf.next_out_index = total;
        inf.avail_out = 16;
        flush = inf.avail_in === 0 ? Z_NO_FLUSH : Z_NO_FLUSH;
        ret = inflate(inf, flush);
        if (ret !== Z_OK && ret !== Z_STREAM_END) {
          throw new Error(`inflate error: ${ret}`);
        }
        const used = inf.next_out_index - total;
        total += used;
      } while (inf.avail_out === 0);
    } while (flush !== Z_NO_FLUSH && ret !== Z_STREAM_END);
    assert.strictEqual(ret, Z_STREAM_END);
    ret = inflateEnd(inf);
    assert.strictEqual(ret, Z_OK);
    const inflated = new Uint8Array(outbuf.buffer, outbuf.byteOffset, total);
    assert.strictEqual(inflated.length, input_len);
    assertArraysEqual(inflated, inputBytes, "inflate-flush-modes decompressed data differs");
  });
  it("should perform inflate Z_FULL_FLUSH: decompress part, flush, decompress rest, finish", () => {
    const inputStr = "flush test data for zlib";
    const inputBytes = new TextEncoder().encode(inputStr);
    const input_len = inputBytes.length;
    const comp = zlib.deflateSync(inputBytes);
    const comp_len = comp.length;
    const compBytes = new Uint8Array(comp.buffer, comp.byteOffset, comp.length);
    const outbuf = new Uint8Array(128);

    let flush: number;
    let total = 0;
    const inf = createInflateStream();
    let ret = inflateInit(inf);
    assert.strictEqual(ret, Z_OK);
    inf.next_in = compBytes;
    inf.next_in_index = 0;
    inf.avail_in = Math.floor(comp_len / 2);
    do {
      do {
        inf.next_out = outbuf;
        inf.next_out_index = total;
        inf.avail_out = CHUNK;
        flush = inf.avail_in === 0 ? Z_FULL_FLUSH : Z_NO_FLUSH;
        ret = inflate(inf, flush);
        if (ret === Z_STREAM_ERROR) {
          throw new Error(`deflate error: ${ret}`);
        }
        const used = inf.next_out_index - total;
        total += used;
      } while (inf.avail_out === 0);
    } while (flush !== Z_FULL_FLUSH);
    inf.next_in = compBytes;
    inf.next_in_index = Math.floor(comp_len / 2);
    inf.avail_in = comp_len - Math.floor(comp_len / 2);
    do {
      do {
        inf.next_out = outbuf;
        inf.next_out_index = total;
        inf.avail_out = CHUNK;
        flush = inf.avail_in === 0 ? Z_FINISH : Z_NO_FLUSH;
        ret = inflate(inf, flush);
        if (ret === Z_STREAM_ERROR) {
          throw new Error(`deflate error: ${ret}`);
        }
        const used = inf.next_out_index - total;
        total += used;
      } while (inf.avail_out === 0);
    } while (flush !== Z_FINISH && ret !== Z_STREAM_END);
    assert.strictEqual(ret, Z_STREAM_END);
    ret = inflateEnd(inf);
    assert.strictEqual(ret, Z_OK);
    const inflated = new Uint8Array(outbuf.buffer, outbuf.byteOffset, total);
    assert.strictEqual(inflated.length, input_len);
    assertArraysEqual(inflated, inputBytes, "flush-modes decompressed data differs");
  });
});
