import test from "node:test";
import assert from "node:assert/strict";
import { createDeflateStream, deflateInit2_, deflateParams } from "../../src/index";
import { Z_OK } from "../../src/mod/common/constants";

// Test deflateParams reconfigures state for new level/strategy

test("deflate: deflateParams updates level and strategy", () => {
  const strm = createDeflateStream();
  const ret = deflateInit2_(strm, 6);
  assert.equal(ret, Z_OK);

  // Change to maximal compression and RLE strategy
  const r = deflateParams(strm, 9, 3); // level=9, strategy Z_RLE (3)
  assert.equal(r, Z_OK);

  const s: any = strm._state;
  assert.equal(s._level, 9);
  assert.equal(s._strategy, 3);
});
