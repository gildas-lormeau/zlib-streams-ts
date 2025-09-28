import test from "node:test";
import assert from "node:assert";

import { createDeflateState, _tr_tally_lit, _tr_tally_dist } from "../../src/mod/deflate/utils";
import { createDeflateStream } from "../../src/mod/deflate/index";

test("deflate/utils: _tr_tally_lit records a literal and updates freq", () => {
  const strm: any = createDeflateStream();
  const s: any = createDeflateState(strm);
  s._sym_buf = new Uint8Array(64);
  s._sym_buf_index = 0;
  s._sym_next = 0;
  s._sym_end = 6; // force flush after two literals (3 bytes each)

  const flush = _tr_tally_lit(s, 0x41);
  assert.strictEqual(s._dyn_ltree[0x41]._freq > 0, true);
  // Should not flush yet
  assert.strictEqual(flush, false);
});

test("deflate/utils: _tr_tally_dist records a distance/length and may flush", () => {
  const strm: any = createDeflateStream();
  const s: any = createDeflateState(strm);
  s._sym_buf = new Uint8Array(64);
  s._sym_buf_index = 0;
  s._sym_next = 0;
  s._sym_end = 3; // cause flush after one dist (3 bytes)

  const shouldFlush = _tr_tally_dist(s, 100, 5);
  // after one tally, sym_next should equal sym_end and return true
  assert.strictEqual(shouldFlush, true);
  // ensure dyn_dtree updated
  assert.ok(s._dyn_dtree.length > 0);
});
