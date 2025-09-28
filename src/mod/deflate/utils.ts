import type { Stream, DeflateStream, DeflateState, HuffmanTreeNode } from "../common/types";

import { BYTE_BITS, W_SIZE, W_BITS, W_MASK, EMPTY_UINT8 } from "../common/constants";
import { DeflateStatus, TreeDescription, StaticTreeDescription } from "../common/types";
import { createBaseState } from "../common/utils";

import {
  DIST_CODE,
  ERROR_MESSAGES,
  MIN_LOOKAHEAD,
  L_CODES,
  D_CODES,
  BL_CODES,
  HEAP_SIZE,
  MAX_BITS,
  LITERALS,
  LENGTH_CODE,
  DEF_MEM_LEVEL,
  MIN_MATCH,
} from "./constants";

export function ERR_MSG(err: number): string {
  const idx = err < -6 || err > 2 ? 9 : 2 - err;
  return ERROR_MESSAGES[idx] || "";
}

export function ERR_RETURN(strm: Stream, err: number): number {
  try {
    strm.msg = ERR_MSG(err);
  } catch (error) {
    strm.msg = `"zlib error " + String(err); (${error})`;
  }
  return err;
}

export function bitReverse(v: number, bits: number): number {
  let x = v >>> 0;
  let r = 0;
  for (let i = 0; i < bits; i++) {
    r = (r << 1) | (x & 1);
    x >>>= 1;
  }
  return r;
}

export function put_byte(s: DeflateState, c: number): void {
  s._pending_buffer[s._pending++] = c;
}

export function put_short(s: DeflateState, w: number): void {
  put_byte(s, w & 0xff);
  put_byte(s, (w >>> 8) & 0xff);
}

export function _tr_tally_dist(s: DeflateState, distance: number, length: number): boolean {
  const len = length & 0xff;
  let dist = distance & 0xffff;

  const base = s._sym_buf_index;
  const idx1 = base + s._sym_next;
  s._pending_buffer[idx1] = dist & 0xff;
  s._pending_buffer[idx1 + 1] = (dist >>> 8) & 0xff;
  s._pending_buffer[idx1 + 2] = len;
  s._sym_next += 3;
  dist = (dist - 1) & 0xffff;
  s._dyn_ltree[LENGTH_CODE[len] + LITERALS + 1]._freq++;
  s._dyn_dtree[d_code(dist)]._freq++;
  return s._sym_next == s._sym_end;
}

export function _tr_tally_lit(s: DeflateState, c: number): boolean {
  const cc = c & 0xff;
  const base = s._sym_buf_index;
  const idx1 = base + s._sym_next;
  s._pending_buffer[idx1] = 0;
  s._pending_buffer[idx1 + 1] = 0;
  s._pending_buffer[idx1 + 2] = cc;
  s._sym_next += 3;
  s._dyn_ltree[cc]._freq++;
  return s._sym_next == s._sym_end;
}

export function MAX_DIST(s: DeflateState): number {
  return s._w_size - MIN_LOOKAHEAD;
}

export function d_code(dist: number): number {
  return dist < 256 ? DIST_CODE[dist] : DIST_CODE[256 + (dist >> 7)];
}

export function createDeflateState(strm: DeflateStream): DeflateState {
  const HASH_BITS_BASE = 7;
  const hash_bits = DEF_MEM_LEVEL + HASH_BITS_BASE;
  const hash_size = 1 << hash_bits;
  const hash_mask = (1 << hash_bits) - 1;
  const hash_shift = Math.floor((hash_bits + MIN_MATCH - 1) / MIN_MATCH);
  const lit_bufsize = 1 << (BYTE_BITS + DEF_MEM_LEVEL);
  const base = createBaseState(strm, W_BITS);
  const state: DeflateState = {
    ...base,
    _strm: strm,
    _status: DeflateStatus.INIT_STATE,
    _wrap: 0,
    _gzhead: undefined,
    _w_mask: W_MASK,
    _hash_bits: hash_bits,
    _hash_size: hash_size,
    _hash_mask: hash_mask,
    _hash_shift: hash_shift,
    _prev: new Uint16Array(W_SIZE),
    _head: new Uint16Array(hash_size),
    _lit_bufsize: lit_bufsize,
    _pending_buffer: new Uint8Array(W_SIZE),
    _pending_buffer_index: 0,
    _pending_bit_buffer_size: W_SIZE,
    _pending: 0,
    _pending_out_index: 0,
    _opt_len: 0,
    _static_len: 0,
    _matches: 0,
    _insert: 0,
    _last_flush: -2,
    _block_start: 0,
    _strstart: 0,
    _lookahead: 0,
    _match_length: 0,
    _prev_length: 0,
    _prev_match: 0,
    _match_available: 0,
    _ins_h: 0,
    _level: 0,
    _strategy: 0,
    _good_match: 0,
    _nice_match: 0,
    _max_chain_length: 0,
    _max_lazy_match: 0,
    _heap: new Int32Array(2 * L_CODES + 1),
    _depth: new Uint8Array(2 * L_CODES + 1),
    _bl_count: new Uint16Array(MAX_BITS + 1),
    _sym_next: 0,
    _sym_end: 0,
    _sym_buf: EMPTY_UINT8,
    _sym_buf_index: 0,
    _bit_used: 0,
    _gzindex: 0,
    _method: 8,
    _window_buffer_size: W_SIZE,
    _match_start: 0,
    _heap_len: 0,
    _heap_max: 0,
  _dyn_ltree: new Array(HEAP_SIZE).fill(0).map(() => createHuffmanTreeNode()),
  _dyn_dtree: new Array(2 * D_CODES + 1).fill(0).map(() => createHuffmanTreeNode()),
  _bl_tree: new Array(2 * BL_CODES + 1).fill(0).map(() => createHuffmanTreeNode()),
    _l_desc: createTreeDescription(),
    _d_desc: createTreeDescription(),
    _bl_desc: createTreeDescription(),
  };
  return state;
}

export function createHuffmanTree(treeData: Int32Array): HuffmanTreeNode[] {
  const nodes: HuffmanTreeNode[] = [];
  for (let i = 0; i < treeData.length; i += 2) {
    const code = treeData[i];
    const len = treeData[i + 1];
    const node: HuffmanTreeNode = createHuffmanTreeNode();
    node._code = code;
    node._len = len;
    nodes.push(node);
  }
  return nodes;
}

export function createHuffmanTreeNode(): HuffmanTreeNode {
  return { _freq: 0, _code: 0, _dad: 0, _len: 0 };
}

function createTreeDescription(): TreeDescription {
  return new TreeDescription([], createStaticTreeDescription(null, EMPTY_UINT8, 0, 0, 0));
}

function createStaticTreeDescription(
  tree: ReadonlyArray<HuffmanTreeNode> | null,
  extra_bits: Uint8Array,
  extra_base: number,
  elems: number,
  max_length: number,
): StaticTreeDescription {
  return new StaticTreeDescription(tree, extra_bits, extra_base, elems, max_length);
}
