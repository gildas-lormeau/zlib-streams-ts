import assert from "node:assert";
import { inflate_table } from "../../src/mod/inflate/inftrees";
import { codeOp, codeBits, codeVal } from "../../src/mod/inflate/utils";
import { CodeType } from "../../src/mod/common/types";

export default function testInftreesCreatesSubtable(): void {
  const codes = 12;
  const bits = { _value: 3 }; // small root to force sub-tables

  // Craft lens so some codes have length > root
  const lens = new Uint16Array([2, 3, 3, 4, 4, 5, 5, 6, 0, 0, 0, 0]);
  const work = new Uint16Array(codes);
  const index = { _value: 0 };
  const table: { _value: Int32Array } = { _value: new Int32Array(1024) };

  const ret = inflate_table(CodeType.LENS, lens, codes, table, bits, work, index);
  assert.strictEqual(ret, 0, "inflate_table should succeed");

  const root = bits._value;
  const usedRootSlots = 1 << root;
  let found = false;
  for (let low = 0; low < usedRootSlots; low++) {
    const entry = table._value[low];
    const op = codeOp(entry);
    if (codeBits(entry) === root && op > 0 && (op & 0xf0) === 0) {
      // pointer to sub-table
      found = true;
      assert.ok(op > 0, "sub-table op should be > 0");
      assert.ok(codeVal(entry) >= 0, "val should be table offset");
      break;
    }
  }
  assert.ok(found, "expected at least one sub-table pointer in the root table");
}
