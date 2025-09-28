import test from "node:test";
import assert from "node:assert/strict";
import { inflate_table } from "../../src/mod/inflate/inftrees";
import { CodeType } from "../../src/mod/common/types";

test("inftrees9: builds sub-tables and root pointers correctly", () => {
  // Create a lens array that will generate a root table with a sub-table.
  // We choose a small codes count and assign some longer lengths to force
  // sub-table creation. This focuses on the table-building logic itself.
  // Use a known-working lens vector used in the non-9 inftrees test to
  // ensure a valid and complete set that forces subtables.
  // Use a small, complete set of code lengths: one code length 1, one length
  // 2, and two of length 3. This is a complete prefix set (1/2 + 1/4 + 2/8 == 1)
  // and with a root bits value of 2 we expect codes with len=3 to force
  // creation of a sub-table (len > root).
  const codes = 4;
  const lens = new Uint16Array([1, 2, 3, 3]);

  const tableRef: { _value: any[] } = { _value: new Array(1024).fill(null).map(() => ({ _op: 0, _bits: 0, _val: 0 })) };
  const bitsRef = { _value: 2 }; // small root size to force sub-tables
  const work = new Uint16Array(288);
  const indexRef = { _value: 0 };

  const ret = inflate_table(CodeType.LENS, lens, codes, tableRef, bitsRef, work, indexRef, true);
  assert.strictEqual(ret, 0, "inflate_table9 should succeed building table");

  // After building, some root entries should be pointers to subtables (op != 0)
  const root = bitsRef._value;
  let foundPointer = false;
  for (let low = 0; low < 1 << root; low++) {
    const entry = tableRef._value[indexRef._value - (1 << root) + low];
    if (entry && entry._op && (entry._op & 0xf0) === 0) {
      // pointer to sub-table
      foundPointer = true;
      // val should be an offset (relative) into the table
      assert.ok(typeof entry._val === "number");
      assert.ok(entry._val >= 0);
    }
  }
  assert.ok(foundPointer, "expected at least one root pointer to a sub-table");
});
