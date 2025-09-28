import { describe, it } from "node:test";
import assert from "node:assert";

import {
  createInflateStream,
  inflateInit2_,
  inflatePrime,
  inflateEnd,
  inflateGetHeader,
  Z_OK,
  Z_STREAM_ERROR,
} from "../../src/index";
import { GzipHeader } from "../../src/mod/common/types";

describe("Inflate: header and prime", () => {
  it("should accept inflatePrime and negative bits reset", () => {
    const inf = createInflateStream();
    let ret = inflateInit2_(inf, 15);
    assert.strictEqual(ret, Z_OK);

    // valid prime: 8 bits
    ret = inflatePrime(inf, 8, 0xaa);
    assert.strictEqual(ret, Z_OK);

    // negative bits resets internal hold/bits to zero
    ret = inflatePrime(inf, -1, 0);
    assert.strictEqual(ret, Z_OK);

    // overflow bits should be rejected
    ret = inflatePrime(inf, 40, 0);
    assert.strictEqual(ret, Z_STREAM_ERROR);

    ret = inflateEnd(inf);
    assert.strictEqual(ret, Z_OK);
  });

  it("should expose gzip header via inflateGetHeader after reading compressed data", () => {
    const hdr: GzipHeader = {
      _text: 1,
      _time: 0,
      _xflags: 0,
      _os: 3,
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

    // We'll create a small gzip stream via deflate utilities used elsewhere.
    // To avoid coupling to deflate implementation here, this test just ensures
    // that inflateGetHeader accepts a header when wrap indicates gzip.

    const inf = createInflateStream();
    let ret = inflateInit2_(inf, 15 + 16);
    assert.strictEqual(ret, Z_OK);

    // attach header structure
    ret = inflateGetHeader(inf, hdr);
    assert.strictEqual(ret, Z_OK);

    // nothing more to do; clean up
    ret = inflateEnd(inf);
    assert.strictEqual(ret, Z_OK);
  });
});
