import { assertArraysEqual } from "../common/utils";
import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";

import {
  createDeflateStream,
  deflateInit,
  deflate,
  deflateEnd,
  Z_NO_FLUSH,
  Z_FINISH,
  Z_SYNC_FLUSH,
  Z_FULL_FLUSH,
  Z_STREAM_ERROR,
  Z_STREAM_END,
  Z_OK,
} from "../../src/index";

const CHUNK = 16;

function runInflateStream(compressed: Uint8Array, compLen: number, expectedLen: number): Uint8Array {
  const inflatedBuf = zlib.inflateSync(compressed.subarray(0, compLen));
  const inflated = new Uint8Array(inflatedBuf.buffer, inflatedBuf.byteOffset, inflatedBuf.length);
  assert.strictEqual(inflated.length, expectedLen);
  return inflated;
}

describe("Deflate: flush-modes", () => {
  it("should perform deflate Z_NO_FLUSH: compress all input, then finish with Z_FINISH", () => {
    const inputStr = "flush test data for zlib";
    const inputBytes = new TextEncoder().encode(inputStr);
    const input_len = inputBytes.length;
    const comp = new Uint8Array(128);

    let flush: number;
    let total = 0;
    const def = createDeflateStream();
    def.next_in = inputBytes;
    def.next_in_index = 0;
    let ret = deflateInit(def, 9);
    assert.strictEqual(ret, 0);
    def.next_in = inputBytes;
    def.avail_in = input_len;
    do {
      do {
        def.next_out = comp;
        def.next_out_index = total;
        def.avail_out = CHUNK;
        flush = def.avail_in === 0 ? Z_FINISH : Z_NO_FLUSH;
        ret = deflate(def, flush);
        if (ret === Z_STREAM_ERROR) {
          throw new Error(`deflate error: ${ret}`);
        }
        const used = def.next_out_index - total;
        total += used;
      } while (def.avail_out === 0);
    } while (flush !== Z_FINISH);
    assert.strictEqual(ret, Z_STREAM_END);
    ret = deflateEnd(def);
    assert.strictEqual(ret, Z_OK);

    const inflated = runInflateStream(comp, total, input_len);
    assertArraysEqual(inflated, inputBytes, "flush-modes decompressed data differs");
  });

  it("should perform deflate Z_SYNC_FLUSH, Z_FULL_FLUSH, Z_BLOCK if available", () => {
    const inputStr = "flush test data for zlib";
    const inputBytes = new TextEncoder().encode(inputStr);
    const input_len = inputBytes.length;
    const comp = new Uint8Array(128);

    let flush: number;
    let total = 0;
    const def = createDeflateStream();
    def.next_in = inputBytes;
    def.next_in_index = 0;
    let ret = deflateInit(def, 9);
    assert.strictEqual(ret, 0);
    def.next_in = inputBytes;
    def.avail_in = input_len;
    do {
      do {
        def.next_out = comp;
        def.next_out_index = total;
        def.avail_out = CHUNK;
        flush = def.avail_in === 0 ? Z_SYNC_FLUSH : Z_NO_FLUSH;
        ret = deflate(def, flush);
        if (ret === Z_STREAM_ERROR) {
          throw new Error(`deflate error: ${ret}`);
        }
        const used = def.next_out_index - total;
        total += used;
      } while (def.avail_out === 0);
    } while (flush !== Z_SYNC_FLUSH);
    // Drain until Z_STREAM_END
    do {
      do {
        def.next_out = comp;
        def.next_out_index = total;
        def.avail_out = CHUNK;
        ret = deflate(def, Z_FINISH);
        if (ret === Z_STREAM_ERROR) {
          throw new Error(`deflate error: ${ret}`);
        }
        const used = def.next_out_index - total;
        total += used;
      } while (def.avail_out === 0);
    } while (ret !== Z_STREAM_END);
    ret = deflateEnd(def);
    assert.strictEqual(ret, Z_OK);

    const inflated = runInflateStream(comp, total, input_len);
    assertArraysEqual(inflated, inputBytes, "flush-modes decompressed data differs");
  });

  it("should perform deflate Z_FULL_FLUSH: compress part, flush, compress rest, finish", () => {
    const inputStr = "flush test data for zlib";
    const inputBytes = new TextEncoder().encode(inputStr);
    const input_len = inputBytes.length;
    const comp = new Uint8Array(128);

    let flush: number;
    let total = 0;
    const def = createDeflateStream();
    let ret = deflateInit(def, 9);
    assert.strictEqual(ret, Z_OK);
    def.next_in = inputBytes;
    def.avail_in = Math.floor(input_len / 2);
    do {
      do {
        def.next_out = comp;
        def.next_out_index = total;
        def.avail_out = CHUNK;
        flush = def.avail_in === 0 ? Z_FULL_FLUSH : Z_NO_FLUSH;
        ret = deflate(def, flush);
        if (ret === Z_STREAM_ERROR) {
          throw new Error(`deflate error: ${ret}`);
        }
        const used = def.next_out_index - total;
        total += used;
      } while (def.avail_out === 0);
    } while (flush !== Z_FULL_FLUSH);
    def.next_in = inputBytes;
    def.next_in_index = Math.floor(input_len / 2);
    def.avail_in = input_len - Math.floor(input_len / 2);
    do {
      do {
        def.next_out = comp;
        def.next_out_index = total;
        def.avail_out = CHUNK;
        flush = def.avail_in === 0 ? Z_FINISH : Z_NO_FLUSH;
        ret = deflate(def, flush);
        if (ret === Z_STREAM_ERROR) {
          throw new Error(`deflate error: ${ret}`);
        }
        const used = def.next_out_index - total;
        total += used;
      } while (def.avail_out === 0);
    } while (flush !== Z_FINISH && ret !== Z_STREAM_END);
    ret = deflateEnd(def);
    assert.strictEqual(ret, Z_OK);

    const inflated = runInflateStream(comp, total, input_len);
    assertArraysEqual(inflated, inputBytes, "flush-modes decompressed data differs");
  });
});
