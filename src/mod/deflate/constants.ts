import type { HuffmanTreeNode } from "../common/types";

import { BASE_DIST, BASE_LENGTH, EXTRA_LBITS_DATA, EXTRA_DBITS_DATA } from "../common/constants";
import { fillData } from "../common/utils";

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

const EXTRA_LBITS: Uint16Array = fillData(EXTRA_LBITS_DATA);
const EXTRA_DBITS: Uint16Array = fillData(EXTRA_DBITS_DATA);
const EXTRA_BLBITS: Uint16Array = new Uint16Array(19);
EXTRA_BLBITS[16] = 2;
EXTRA_BLBITS[17] = 3;
EXTRA_BLBITS[18] = 7;

const STATIC_LTREE_DATA: Uint16Array = packCanonicalTreeData(getStaticLiteralLengths());
const STATIC_DTREE_DATA: Uint16Array = packCanonicalTreeData(new Array(30).fill(5));

export const STATIC_LTREE: ReadonlyArray<HuffmanTreeNode> = createHuffmanTree(STATIC_LTREE_DATA);
export const STATIC_DTREE: ReadonlyArray<HuffmanTreeNode> = createHuffmanTree(STATIC_DTREE_DATA);
export const LENGTH_CODE: Uint8Array = buildLengthCodeLookup(BASE_LENGTH, EXTRA_LBITS, MAX_MATCH);
export const DIST_CODE: Uint8Array = buildCompactDistLookup512(buildFullDistanceLookup(BASE_DIST, EXTRA_DBITS));

export { BASE_LENGTH, BASE_DIST, EXTRA_DBITS, EXTRA_LBITS, EXTRA_BLBITS };
