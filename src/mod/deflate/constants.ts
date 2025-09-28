import type { HuffmanTreeNode } from "../common/types";

import { createHuffmanTree } from "./utils";
import {
  buildLengthCodeLookup,
  buildFullDistanceLookup,
  buildCompactDistLookup512,
  packCanonicalTreeData,
  getStaticLiteralLengths,
} from "./trees-util";

export const DEF_MEM_LEVEL = 8;
export const MIN_MATCH = 3;
export const MAX_MATCH = 258;
export const MIN_LOOKAHEAD = MAX_MATCH + MIN_MATCH + 1;
export const BI_BUF_SIZE = 16;
export const WIN_INIT = MAX_MATCH;
export const LENGTH_CODES = 29;
export const LITERALS = 256;
export const L_CODES = LITERALS + 1 + LENGTH_CODES;
export const D_CODES = 30;
export const BL_CODES = 19;
export const HEAP_SIZE = 2 * L_CODES + 1;
export const MAX_BITS = 15;
export const MAX_MEM_LEVEL = 9;
export const OS_CODE = 255;
export const PRESET_DICT = 0x20;
export const LIT_BUFS = 4;
export const END_BLOCK = 256;
export const REP_3_6 = 16;
export const REPZ_3_10 = 17;
export const REPZ_11_138 = 18;
export const STORED_BLOCK = 0;
export const STATIC_TREES = 1;
export const DYN_TREES = 2;

export const LAST_FLUSH = -1;

export const ERROR_MESSAGES: ReadonlyArray<string> = [
  "need dictionary",
  "stream end",
  "",
  "file error",
  "stream error",
  "data error",
  "insufficient memory",
  "buffer error",
  "",
];

const BASE_LENGTH: Int32Array = new Int32Array([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 0,
]);
const BASE_DIST: Int32Array = new Int32Array([
  0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 6144,
  8192, 12288, 16384, 24576,
]);
const EXTRA_LBITS: ReadonlyArray<number> = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const EXTRA_DBITS: ReadonlyArray<number> = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
const EXTRA_BLBITS: ReadonlyArray<number> = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7];

const FULL_DIST: Uint8Array = buildFullDistanceLookup(BASE_DIST, EXTRA_DBITS as ReadonlyArray<number>);
const STATIC_LTREE_DATA: Int32Array = packCanonicalTreeData(getStaticLiteralLengths());
const STATIC_DTREE_DATA: Int32Array = packCanonicalTreeData(new Array(30).fill(5));

export const STATIC_LTREE: ReadonlyArray<HuffmanTreeNode> = createHuffmanTree(STATIC_LTREE_DATA);
export const STATIC_DTREE: ReadonlyArray<HuffmanTreeNode> = createHuffmanTree(STATIC_DTREE_DATA);
export const LENGTH_CODE: Uint8Array = buildLengthCodeLookup(
  BASE_LENGTH,
  EXTRA_LBITS as ReadonlyArray<number>,
  MAX_MATCH,
);
export const DIST_CODE: Uint8Array = buildCompactDistLookup512(FULL_DIST);

export { BASE_LENGTH, BASE_DIST, EXTRA_DBITS, EXTRA_LBITS, EXTRA_BLBITS };
