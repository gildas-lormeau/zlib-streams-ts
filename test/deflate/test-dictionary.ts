import { assertArraysEqual } from "../common/utils";
import { describe, it } from "node:test";
import assert from "node:assert";

import {
  createDeflateStream,
  deflateInit,
  deflate,
  deflateEnd,
  deflateSetDictionary,
  createInflateStream,
  inflateInit,
  inflate,
  inflateSetDictionary,
  inflateEnd,
  Z_NO_FLUSH,
  Z_FINISH,
  Z_STREAM_END,
  Z_OK,
  Z_NEED_DICT,
} from "../../src/index";

const OUT_SIZE = 4096;

describe("Deflate: dictionary support", () => {
  it("roundtrip with preset dictionary", () => {
    const dict = new TextEncoder().encode("example-dictionary-data: repeated words repeated words");
    const payload = new TextEncoder().encode("repeated words repeated words and some extra payload data");

    // Compress with preset dictionary
    const def = createDeflateStream();
    let ret = deflateInit(def, 6);
    assert.strictEqual(ret, Z_OK);
    ret = deflateSetDictionary(def, dict, dict.length);
    assert.strictEqual(ret, Z_OK);

    const comp = new Uint8Array(OUT_SIZE);
    def.next_in = payload;
    def.next_in_index = 0;
    def.avail_in = payload.length;
    def.next_out = comp;
    def.next_out_index = 0;
    def.avail_out = comp.length;

    // call deflate until the stream reports stream-end (strict zlib behavior)
    do {
      ret = deflate(def, Z_FINISH);
      if (ret === Z_STREAM_END) {
        break;
      }
      if (ret !== Z_OK) {
        throw new Error(`deflate error: ${ret}`);
      }
      // if not finished and output buffer was filled, increase compLen or fail
      if (def.avail_out === 0) {
        break;
      } // avoid infinite loop; caller should provide more space
    } while (true);
    const compLen = def.next_out_index;
    ret = deflateEnd(def);
    assert.strictEqual(ret, Z_OK);

    // Decompress with our inflate and supply the dictionary
    const inf = createInflateStream();
    ret = inflateInit(inf);
    assert.strictEqual(ret, Z_OK);
    inf.next_in = comp.subarray(0, compLen);
    inf.next_in_index = 0;
    inf.avail_in = compLen;
    const out = new Uint8Array(OUT_SIZE);
    inf.next_out = out;
    inf.next_out_index = 0;
    inf.avail_out = out.length;

    // inflate until Z_STREAM_END (strict)
    do {
      ret = inflate(inf, Z_NO_FLUSH);
      if (ret === Z_NEED_DICT) {
        const setRet = inflateSetDictionary(inf, dict, dict.length);
        assert.strictEqual(setRet, Z_OK);
        continue; // after supplying dictionary, call inflate again
      }
      if (ret === Z_STREAM_END) {
        break;
      }
      if (ret !== Z_OK) {
        throw new Error(`inflate error: ${ret}`);
      }
      // if we made no progress but didn't finish, avoid infinite loop
      if (inf.avail_out === 0) {
        break;
      }
    } while (true);

    const outLen = inf.next_out_index;
    const inflated = out.subarray(0, outLen);
    assertArraysEqual(inflated, payload, "dictionary roundtrip failed");
    ret = inflateEnd(inf);
    assert.strictEqual(ret, Z_OK);
  });
});
