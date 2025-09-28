import type { InflateStream, InflateState, GzipHeader, HuffmanCode } from "../common/types";

import { EMPTY_UINT8 } from "../common/constants";
import { InflateMode } from "../common/types";
import { createBaseState } from "../common/utils";

import { ENOUGH_LENS, ENOUGH_DISTS, ENOUGH_DISTS_9 } from "./constants";

export function createInflateState(strm: InflateStream, deflate64: boolean): InflateState {
  const emptyCodes: HuffmanCode[] = [];
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
    _codes: new Array(codesLength).fill(null).map(() => createCode()),
    _next_index: 0,
    _sane: true,
    _back: 0,
    _was: 0,
    _deflate64: deflate64,
  };
}

export function createCode(op: number = 0, bits: number = 0, val: number = 0): HuffmanCode {
  return { _op: op, _bits: bits, _val: val };
}

export function createInvalidCodeMarker(bits: number = 1): HuffmanCode {
  return { _op: 64, _bits: bits, _val: 0 };
}

export function createEndOfBlockCode(bits: number = 0): HuffmanCode {
  return { _op: 32 + 64, _bits: bits, _val: 0 };
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
