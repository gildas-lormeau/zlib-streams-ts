import type { Stream } from "./types";

import { EMPTY_UINT8 } from "./constants";

export function zmemcpy(
  destination: Uint8Array | Uint16Array,
  destinationIndex: number,
  source: Uint8Array | Uint16Array,
  sourceIndex: number,
  len: number,
): void {
  if (len == 0) {
    return;
  }
  const dest =
    destination instanceof Uint8Array
      ? destination
      : new Uint8Array(destination.buffer, destination.byteOffset, destination.byteLength);
  const src =
    source instanceof Uint8Array
      ? source.subarray(sourceIndex, sourceIndex + len)
      : new Uint8Array(source.buffer, source.byteOffset + sourceIndex, len);
  dest.set(src, destinationIndex);
}

export function zmemzero(destination: Uint8Array | Uint16Array, destinationIndex: number, len: number): void {
  if (len == 0) {
    return;
  }
  const dest =
    destination instanceof Uint8Array
      ? destination
      : new Uint8Array(destination.buffer, destination.byteOffset, destination.byteLength);
  dest.fill(0, destinationIndex, destinationIndex + len);
}

export function createStream(): Stream {
  return {
    next_in: EMPTY_UINT8,
    next_in_index: 0,
    avail_in: 0,
    total_in: 0,
    next_out: EMPTY_UINT8,
    next_out_index: 0,
    avail_out: 0,
    total_out: 0,
    msg: "",
    _data_type: 0,
    _adler: 0,
    _reserved: 0,
    _state: undefined,
  };
}

export function createBaseState(strm: Stream, w_bits: number): {
  _strm: Stream;
  _window: Uint8Array;
  _w_size: number;
  _w_bits: number;
  _w_have: number;
  _w_next: number;
  _bit_buffer: number;
  _bit_count: number;
} {
  const w_size = 1 << w_bits;
  return {
    _strm: strm,
    _window: new Uint8Array(w_size),
    _w_size: w_size,
    _w_bits: w_bits,
    _w_have: 0,
    _w_next: 0,
    _bit_buffer: 0,
    _bit_count: 0,
  };
}

export function fillData(data: number[]): Uint16Array {
  const arr: number[] = [];
  for (let i = 0; i < data.length; i += 2) {
    const value = data[i];
    const count = data[i + 1];
    for (let i = 0; i < count; i++) {
      arr.push(value);
    }
  }
  return new Uint16Array(arr);
}
