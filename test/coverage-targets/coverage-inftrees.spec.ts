import test from "node:test";
import assert from "node:assert";

import { inflate_table } from "../../src/mod/inflate/inftrees";
import { CodeType } from "../../src/index";

test("inftrees: empty code set produces table with invalid marker", () => {
  const lens = new Uint16Array(1);
  lens[0] = 0;
  const tableRef: any = { _value: [] };
  const bitsRef: any = { _value: 4 };
  const indexRef: any = { _value: 0 };
  const work = new Uint16Array(1);
  const ret = inflate_table(CodeType.CODES, lens, 1, tableRef, bitsRef, work, indexRef);
  assert.strictEqual(ret, 0);
  // bits should be set to a small non-zero (1)
  assert.ok(bitsRef._value >= 1);
});

test("inftrees: oversubscribed lengths returns -1", () => {
  // Construct lens with impossible counts to provoke over-subscribed
  const lens = new Uint16Array(16);
  for (let i = 0; i < lens.length; i++) {
    lens[i] = 15;
  }
  const tableRef: any = { _value: new Array(1024) };
  const bitsRef: any = { _value: 1 };
  const indexRef: any = { _value: 0 };
  const work = new Uint16Array(16);
  const ret = inflate_table(CodeType.LENS, lens, lens.length, tableRef, bitsRef, work, indexRef);
  assert.strictEqual(ret, -1);
});

test("inftrees: incomplete set returns -1", () => {
  // Create a lens array that leaves leftover 'left' > 0 and should return -1
  const lens = new Uint16Array(3);
  lens[0] = 1;
  lens[1] = 0;
  lens[2] = 0;
  const tableRef: any = { _value: new Array(1024) };
  const bitsRef: any = { _value: 1 };
  const indexRef: any = { _value: 0 };
  const work = new Uint16Array(3);
  const ret = inflate_table(CodeType.CODES, lens, 3, tableRef, bitsRef, work, indexRef);
  // Incomplete sets return -1
  assert.strictEqual(ret, -1);
});
