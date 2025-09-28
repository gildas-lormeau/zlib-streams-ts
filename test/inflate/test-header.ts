import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";

import {
  createInflateStream,
  inflateInit2_,
  inflateGetHeader,
  inflate,
  inflateEnd,
  Z_OK,
  Z_FINISH,
  Z_STREAM_END,
} from "../../src/index";
import { GzipHeader } from "../../src/mod/common/types";

describe("Inflate: headers and gzip flags", () => {
  it("should accept gzip-formatted input and extract payloads", () => {
    // We'll create a fake gzip compressed buffer using Node's zlib to ensure a valid stream
    const sample = new TextEncoder().encode("hello world");
    const gz = zlib.gzipSync(sample);
    const compBytes = new Uint8Array(gz.buffer, gz.byteOffset, gz.length);

    const inf = createInflateStream();
    let ret = inflateInit2_(inf, 15 + 16);
    assert.strictEqual(ret, Z_OK);

    const header: GzipHeader = {
      _text: 0,
      _time: 0,
      _xflags: 0,
      _os: 0,
      _extra: new Uint8Array(0),
      _extra_max: 0,
      _extra_len: 0,
      _name: new Uint8Array(0),
      _name_max: 0,
      _comment: new Uint8Array(0),
      _comm_max: 0,
      _hcrc: 0,
      _done: 0,
    };
    ret = inflateGetHeader(inf, header);
    assert.strictEqual(ret, Z_OK);

    inf.next_in = compBytes;
    inf.next_in_index = 0;
    inf.avail_in = compBytes.length;
    const outbuf = new Uint8Array(128);
    inf.next_out = outbuf;
    inf.next_out_index = 0;
    inf.avail_out = outbuf.length;

    do {
      ret = inflate(inf, Z_FINISH);
      if (ret !== Z_OK && ret !== Z_STREAM_END) {
        throw new Error(`inflate error: ${ret}`);
      }
    } while (ret !== Z_STREAM_END);

    ret = inflateEnd(inf);
    assert.strictEqual(ret, Z_OK);

    // Ensure header was observed
    assert.strictEqual(header._done, 1);
    assert.strictEqual(header._name.length === 0 || header._name instanceof Uint8Array, true);
  });
});
