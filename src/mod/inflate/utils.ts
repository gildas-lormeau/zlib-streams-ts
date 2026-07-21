import type { InflateStream, InflateState, GzipHeader } from "../common/types";

import { EMPTY_UINT8 } from "../common/constants";

const EMPTY_INT32 = new Int32Array(0);
import { InflateMode } from "../common/types";
import { createBaseState } from "../common/utils";

import { ENOUGH_LENS, ENOUGH_DISTS, ENOUGH_DISTS_9 } from "./constants";

export function createInflateState(strm: InflateStream, deflate64: boolean): InflateState {
  const emptyCodes = EMPTY_INT32;
  const codesLength = deflate64 ? ENOUGH_LENS + ENOUGH_DISTS_9 : ENOUGH_LENS + ENOUGH_DISTS;
  const base = createBaseState(strm, 0);

  return {
    ...base,
    _strm: strm,
    _mode: InflateMode.HEAD,
    _last: false,
    _wrap: 0,
    _havedict: false,
    _flags: 0,
    _dmax: 0,
    _check: 0,
    _total: 0,
    _window: EMPTY_UINT8,
    _length: 0,
    _offset: 0,
    _extra: 0,
    _lencode: emptyCodes,
    _distcode: emptyCodes,
    _lenbits: 0,
    _distbits: 0,
    _ncode: 0,
    _nlen: 0,
    _ndist: 0,
    _have: 0,
    _next: emptyCodes,
    _lens: new Uint16Array(320),
    _work: new Uint16Array(288),
    _codes: new Int32Array(codesLength),
    _next_index: 0,
    _sane: true,
    _back: 0,
    _was: 0,
    _deflate64: deflate64,
  };
}

// A Huffman table entry is packed into a single 32-bit int stored in an Int32Array:
// op in bits 24..31, bits in 16..23, val in 0..15. op never sets bit 31 (max 96), so the
// packed value is always a non-negative int. Reading is a shift+mask; see CODE_OP/BITS/VAL.
export function packCode(op: number, bits: number, val: number): number {
  return (op << 24) | (bits << 16) | val;
}

export function createCode(op: number = 0, bits: number = 0, val: number = 0): number {
  return packCode(op, bits, val);
}

export function codeOp(c: number): number {
  return c >>> 24;
}

export function codeBits(c: number): number {
  return (c >>> 16) & 0xff;
}

export function codeVal(c: number): number {
  return c & 0xffff;
}

export function createInvalidCodeMarker(bits: number = 1): number {
  return packCode(64, bits, 0);
}

export function createEndOfBlockCode(bits: number = 0): number {
  return packCode(32 + 64, bits, 0);
}

export function createGzipHeader(
  options: {
    extra_max?: number;
    name_max?: number;
    comm_max?: number;
  } = {},
): GzipHeader {
  const emptyBuffer = EMPTY_UINT8;
  return {
    _done: 0,
    _text: 0,
    _time: 0,
    _xflags: 0,
    _os: 0,
    _extra_len: 0,
    _extra: emptyBuffer,
    _extra_max: options.extra_max,
    _name: emptyBuffer,
    _name_max: options.name_max,
    _comment: emptyBuffer,
    _comm_max: options.comm_max,
    _hcrc: 0,
  };
}

export function ZSWAP32(value: number): number {
  return (
    ((value & 0xff) << 24) | (((value >> 8) & 0xff) << 16) | (((value >> 16) & 0xff) << 8) | ((value >> 24) & 0xff)
  );
}
