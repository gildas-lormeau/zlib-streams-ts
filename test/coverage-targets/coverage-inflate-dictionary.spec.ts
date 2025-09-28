import test from "node:test";
import assert from "node:assert/strict";
import {
  createInflateStream,
  inflateInit2_,
  inflateSetDictionary,
  inflateGetDictionary,
  Z_OK,
  InflateMode,
} from "../../src/index";
import { adler32 } from "../../src/mod/common/adler32";

// Target: inflateSetDictionary and updatewindow copy branches

test("inflate: inflateSetDictionary accepts dict larger than window and updatewindow copy paths", () => {
  const strm = createInflateStream();
  // inflate with default window (15)
  const ret = inflateInit2_(strm, 15);
  assert.equal(ret, Z_OK);

  // Force DICT mode: set state.mode and state.wrap so inflateSetDictionary is allowed
  // set to DICT state so inflateSetDictionary accepts dictionary
  strm._state._mode = InflateMode.DICT;
  strm._state._wrap = 0;

  // create a dictionary larger than 32K (window size default is 32K)
  const bigDict = new Uint8Array(40000);
  for (let i = 0; i < bigDict.length; i++) {
    bigDict[i] = i & 0xff;
  }

  // set the check value so the dictid matches
  strm._state._check = adler32(0);
  strm._state._check = adler32(strm._state._check, bigDict, bigDict.length);

  // since state.mode === DICT but state.wrap === 0, inflateSetDictionary should accept it
  const r = inflateSetDictionary(strm, bigDict, bigDict.length);
  assert.equal(r, Z_OK);

  // inflateGetDictionary should return the last w_have bytes
  const out = new Uint8Array(32768);
  const len = { _value: 0 };
  const g = inflateGetDictionary(strm, out, len);
  assert.equal(g, Z_OK);
  assert.equal(len._value, 32768);
});
