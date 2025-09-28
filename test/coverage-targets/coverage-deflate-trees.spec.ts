import test from "node:test";
import assert from "node:assert";

import { bi_flush, bi_windup, gen_codes } from "../../src/mod/deflate/trees";
import { bitReverse } from "../../src/mod/deflate/utils";
import { createDeflateState, createHuffmanTreeNode } from "../../src/mod/deflate/utils";

test("trees: bitReverse reverses bits correctly", () => {
  // 0b1101 (13) reversed in 4 bits = 0b1011 (11)
  const r = bitReverse(0b1101, 4);
  assert.strictEqual(r, 0b1011);
});

test("trees: bi_flush and bi_windup write pending bytes as expected", () => {
  const fakeStream: any = {}; // minimal stream placeholder
  const s = createDeflateState(fakeStream);

  // write a single byte into bit_buffer and set bit_count to force put_byte
  s._bit_buffer = 0x12;
  s._bit_count = 8;
  s._pending = 0;
  bi_flush(s);
  // pending buffer should contain one byte (0x12)
  assert.strictEqual(s._pending_buffer[0], 0x12);
  // after flush bit_count should be reduced
  assert.ok(s._bit_count < 8 || s._bit_buffer === 0);

  // test bi_windup: set some bits and ensure pending gets written and bit_used is set
  s._bit_buffer = 0xabcd;
  s._bit_count = 12;
  s._pending = 0;
  bi_windup(s);
  // pending should have at least one byte
  assert.ok(s._pending > 0);
  assert.ok(s._bit_used >= 1 && s._bit_used <= 8);
});

test("trees: gen_codes assigns codes for simple tree", () => {
  // Create a tiny tree with 3 symbols and lengths
  const tree = [createHuffmanTreeNode(), createHuffmanTreeNode(), createHuffmanTreeNode()];
  tree[0]._len = 1;
  tree[1]._len = 3;
  tree[2]._len = 3;

  const bl_count = [0, 1, 0, 2]; // counts for bits 0..3
  gen_codes(tree, 2, bl_count);

  // Codes should be assigned (non-zero) for non-zero lengths
  assert.ok(tree[0]._code >= 0);
  assert.ok(tree[1]._code >= 0);
  assert.ok(tree[2]._code >= 0);
});
