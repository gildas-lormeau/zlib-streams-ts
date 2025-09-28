import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";

import {
  createInflateStream,
  inflateInit,
  inflate,
  inflateSetDictionary,
  inflateEnd,
  Z_NO_FLUSH,
  Z_OK,
  Z_STREAM_END,
  Z_NEED_DICT,
} from "../../src/index";

describe("Inflate: dictionary handling", () => {
  it("should accept preset dictionaries and produce correct output", () => {
    const dictText = "example-dictionary-data: repeated words repeated words";
    const payloadText = "repeated words repeated words and some extra payload data";
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const dict = encoder.encode(dictText);
    const payload = encoder.encode(payloadText);

    // Create compressed bytes using Node zlib with preset dictionary
    const comp = zlib.deflateSync(payload, { dictionary: dict });

    // Decompress using our inflate and set dictionary when asked
    const inf = createInflateStream();
    let ret = inflateInit(inf);
    assert.strictEqual(ret, Z_OK);

    inf.next_in = new Uint8Array(comp);
    inf.next_in_index = 0;
    inf.avail_in = comp.length;
    const outBuf = new Uint8Array(4096);
    inf.next_out = outBuf;
    inf.next_out_index = 0;
    inf.avail_out = outBuf.length;

    // Loop strictly until Z_STREAM_END (zlib reference behavior)
    do {
      ret = inflate(inf, Z_NO_FLUSH);
      if (ret === Z_NEED_DICT) {
        const setRet = inflateSetDictionary(inf, new Uint8Array(dict), dict.length);
        assert.strictEqual(setRet, Z_OK);
        continue;
      }
      if (ret === Z_STREAM_END) {
        break;
      }
      if (ret !== Z_OK) {
        throw new Error(`inflate error: ${ret}`);
      }
      // if output buffer filled, avoid infinite loop (test uses a reasonably large buffer)
      if (inf.avail_out === 0) {
        break;
      }
    } while (true);

    const outLen = inf.next_out_index;
    const inflatedBytes = outBuf.subarray(0, outLen);
    const inflatedText = decoder.decode(inflatedBytes);
    assert.strictEqual(inflatedText.length, payloadText.length);
    assert.strictEqual(inflatedText, payloadText);
    ret = inflateEnd(inf);
    assert.strictEqual(ret, Z_OK);
  });
});
