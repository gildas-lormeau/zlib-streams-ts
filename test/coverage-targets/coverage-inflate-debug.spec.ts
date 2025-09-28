import test from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";
import {
  createInflateStream,
  inflateInit2_,
  inflateSetDictionary,
  inflateGetDictionary,
  inflateSync,
  inflate,
  inflateSyncPoint,
} from "../../src/index";
import { InflateMode, Z_OK, Z_DATA_ERROR, Z_NO_FLUSH } from "../../src/index";
import { adler32 } from "../../src/mod/common/adler32";

test.describe("inflate: debug grouped checks", () => {
  test("set/get dictionary roundtrip (debug)", () => {
    const strm = createInflateStream();
    const ret = inflateInit2_(strm, 15);
    assert.strictEqual(ret, Z_OK);

    const dict = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const state: any = strm._state;
    state._mode = InflateMode.DICT;
    state._wrap = 0;
    state._check = adler32(0);
    state._check = adler32(state._check, dict, dict.length);

    const ret2 = inflateSetDictionary(strm, dict, dict.length);
    assert.strictEqual(ret2, Z_OK);

    const out = new Uint8Array(16);
    const len: any = { _value: 0 };
    const ret3 = inflateGetDictionary(strm, out, len);
    assert.strictEqual(ret3, Z_OK);
    assert.strictEqual(len._value, dict.length);
    for (let i = 0; i < dict.length; i++) {
      assert.strictEqual(out[i], dict[i]);
    }
  });

  test("syncsearch and inflateSync path (debug)", () => {
    const strm = createInflateStream();
    const ret = inflateInit2_(strm, 15);
    assert.strictEqual(ret, Z_OK);
    const junk = new Uint8Array([1, 2, 3, 4, 5, 6]);
    strm.next_in = junk;
    strm.next_in_index = 0;
    strm.avail_in = junk.length;
    const r = inflateSync(strm);
    assert.strictEqual(r, Z_DATA_ERROR);
  });

  test("stored invalid length (debug)", () => {
    const strm = createInflateStream();
    const ret = inflateInit2_(strm, 15);
    assert.strictEqual(ret, Z_OK);
    const state: any = strm._state;
    state._mode = InflateMode.STORED;
    state._bit_count = 0;
    state._bit_buffer = 0;
    const badHeader = new Uint8Array([1, 0, 2, 0]);
    strm.next_in = badHeader;
    strm.next_in_index = 0;
    strm.avail_in = badHeader.length;
    const out = new Uint8Array(16);
    strm.next_out = out;
    strm.next_out_index = 0;
    strm.avail_out = out.length;
    const r = inflate(strm, Z_NO_FLUSH);
    assert.strictEqual(r, Z_DATA_ERROR);
  });

  test("inflateSyncPoint detects STORED (debug)", () => {
    const strm = createInflateStream();
    const ret = inflateInit2_(strm, 15);
    assert.strictEqual(ret, Z_OK);
    const state: any = strm._state;
    state._mode = InflateMode.STORED;
    state._bit_count = 0;
    const v = inflateSyncPoint(strm);
    assert.strictEqual(v, 1);
  });

  test("gzip NAME handling (debug) - skipped", { skip: true, timeout: 2000 }, () => {
    const sample = new TextEncoder().encode("payload");
    const gz = zlib.gzipSync(sample, { filename: "file.txt" } as unknown as zlib.ZlibOptions);
    const comp = new Uint8Array(gz.buffer, gz.byteOffset, gz.length);
    const strm = createInflateStream();
    const ret = inflateInit2_(strm, 15 + 16);
    assert.strictEqual(ret, Z_OK);
    const state: any = strm._state;
    state._gzhead = { _done: 0, _name: new Uint8Array(256), _name_max: 256 };
    strm.next_in = comp;
    strm.next_in_index = 0;
    strm.avail_in = comp.length;
    const out = new Uint8Array(128);
    strm.next_out = out;
    strm.next_out_index = 0;
    strm.avail_out = out.length;
    inflate(strm, Z_NO_FLUSH);
    assert.strictEqual((state._gzhead && state._gzhead._done) || 0, 1);
  });

  test("DICTID -> Z_NEED_DICT (debug)", () => {
    const strm = createInflateStream();
    const ret = inflateInit2_(strm, 15);
    assert.strictEqual(ret, Z_OK);
    const state: any = strm._state;
    state._mode = InflateMode.DICTID;
    state._bit_buffer = 0x12345678;
    state._bit_count = 32;
    const r = inflate(strm, Z_NO_FLUSH);
    assert.strictEqual(r, 2);
  });
});
