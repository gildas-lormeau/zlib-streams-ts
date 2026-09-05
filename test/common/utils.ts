import assert from "node:assert";

import {
  createDeflateStream,
  deflateInit2_,
  deflate,
  deflateEnd,
  createInflateStream,
  inflateInit2_,
  inflate,
  inflateEnd,
  Z_BEST_COMPRESSION,
  Z_OK,
  Z_DEFLATED,
  Z_FINISH,
  Z_NO_FLUSH,
  Z_STREAM_END,
  Z_BUF_ERROR,
} from "../../src/index";

export function chunkedDeflate(
  input: Uint8Array,
  inputLength: number,
  output: Uint8Array,
  outputLength: number,
  wbits: number,
  strategy: number,
  chunkInput: number,
  chunkOutput: number,
): number {
  const strm = createDeflateStream();
  let ret = deflateInit2_(strm, Z_BEST_COMPRESSION, Z_DEFLATED, wbits, 8, strategy);
  assert.strictEqual(ret, Z_OK);
  let in_pos = 0,
    out_pos = 0;
  let flush;
  strm.next_in = input;
  strm.next_out = output;
  do {
    const this_in = in_pos + chunkInput < inputLength ? chunkInput : inputLength - in_pos;
    strm.next_in_index = in_pos;
    strm.avail_in = this_in;
    flush = in_pos + this_in == inputLength ? Z_FINISH : Z_NO_FLUSH;
    do {
      const this_out = out_pos + chunkOutput < outputLength ? chunkOutput : outputLength - out_pos;
      strm.next_in_index = in_pos;
      strm.next_out_index = out_pos;
      strm.avail_out = this_out;
      ret = deflate(strm, flush);
      // Must be either making progress (Z_OK) or finished (Z_STREAM_END).
      assert.ok(ret === Z_OK || ret === Z_STREAM_END, `deflate returned unexpected code: ${ret}`);
      out_pos += this_out - strm.avail_out;
    } while (strm.avail_out === 0);
    in_pos += this_in;
  } while (flush !== Z_FINISH);
  while (true) {
    const this_out = out_pos + chunkOutput < outputLength ? chunkOutput : outputLength - out_pos;
    strm.next_out_index = out_pos;
    strm.avail_out = this_out;
    ret = deflate(strm, Z_FINISH);
    if (ret === Z_STREAM_END) {
      out_pos += this_out - strm.avail_out;
      break;
    }
    assert.strictEqual(ret, Z_OK);
    out_pos += this_out - strm.avail_out;
  }
  ret = deflateEnd(strm);
  assert.strictEqual(ret, Z_OK);
  return out_pos;
}

export function assertArraysEqual(a: Uint8Array, b: Uint8Array, msg = "Arrays differ"): void {
  if (a.length !== b.length) {
    throw new Error(`${msg}: length ${a.length} !== ${b.length}`);
  }
  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) {
      throw new Error(`${msg} at byte ${i}: ${a[i]} !== ${b[i]}`);
    }
  }
}

export function chunkedInflate(
  input: Uint8Array,
  inputLength: number,
  output: Uint8Array,
  outputLength: number,
  wbits: number,
  chunkInput: number,
  chunkOutput: number,
): number {
  const strm = createInflateStream();
  let ret = inflateInit2_(strm, wbits);
  if (ret !== Z_OK) {
    throw new Error(`inflateInit2_ error: ${ret}`);
  }
  let in_pos = 0,
    out_pos = 0;
  do {
    const this_in = in_pos + chunkInput < inputLength ? chunkInput : inputLength - in_pos;
    strm.next_in = input;
    strm.next_in_index = in_pos;
    strm.avail_in = this_in;
    do {
      const this_out = out_pos + chunkOutput < outputLength ? chunkOutput : outputLength - out_pos;
      strm.next_out = output;
      strm.next_out_index = out_pos;
      strm.avail_out = this_out;
      ret = inflate(strm, Z_NO_FLUSH);
      if (ret === Z_BUF_ERROR && strm.avail_in === 0) {
        // No input left and no progress: need more input. Break to outer loop.
        break;
      }
      if (ret !== Z_OK && ret !== Z_STREAM_END) {
        throw new Error(`inflate error: ${ret}`);
      }
      out_pos += this_out - strm.avail_out;
    } while (strm.avail_out === 0 && ret !== Z_STREAM_END);
    in_pos += this_in - strm.avail_in;
  } while (ret != Z_STREAM_END && in_pos < inputLength);
  ret = inflateEnd(strm);
  if (ret !== Z_OK) {
    throw new Error(`inflateEnd error: ${ret}`);
  }
  return out_pos;
}

// chunkedInflate above writes into one output array with an advancing offset, which keeps most
// copies inside that array. The streams API does the opposite: input arrives in slices and every
// output buffer is fresh, so anything reaching before the current buffer comes from the sliding
// window. That is the shape that hid the inffast window-wrap bug, so inflate tests that care
// about the window should drive the codec through this instead.
export function streamingInflate(input: Uint8Array, wbits: number, inChunk: number, outSize: number): Uint8Array {
  const strm = createInflateStream();
  assert.strictEqual(inflateInit2_(strm, wbits), Z_OK);
  const pieces: Uint8Array[] = [];
  let readOffset = 0;
  let ret = Z_OK;
  while (readOffset < input.length) {
    const toRead = Math.min(input.length - readOffset, inChunk);
    const slice = input.subarray(readOffset, readOffset + toRead);
    strm.next_in = slice;
    strm.next_in_index = 0;
    strm.avail_in = slice.length;
    let ended = false;
    while (strm.avail_in > 0) {
      const outBuffer = new Uint8Array(outSize);
      strm.next_out = outBuffer;
      strm.next_out_index = 0;
      strm.avail_out = outBuffer.length;
      ret = inflate(strm, Z_NO_FLUSH);
      const produced = outBuffer.length - strm.avail_out;
      if (produced) {
        pieces.push(outBuffer.slice(0, produced));
      }
      if (ret == Z_STREAM_END || ret != Z_OK) {
        ended = true;
        break;
      }
    }
    if (ended) {
      break;
    }
    readOffset += toRead;
  }
  const message = strm.msg;
  inflateEnd(strm);
  assert.strictEqual(ret, Z_STREAM_END, `inflate returned ${ret}: ${message}`);
  const total = pieces.reduce((sum, piece) => sum + piece.length, 0);
  const output = new Uint8Array(total);
  let position = 0;
  for (const piece of pieces) {
    output.set(piece, position);
    position += piece.length;
  }
  return output;
}
