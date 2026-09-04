import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";
import {
  createInflateStream,
  inflateInit2_,
  inflate,
  inflateEnd,
  Z_OK,
  Z_STREAM_END,
  Z_NO_FLUSH,
} from "../../src/index";
import { assertArraysEqual } from "../common/utils";

// The other inflate tests drive one output buffer with an advancing offset, which keeps most
// copies inside that buffer. The streams API does the opposite: input arrives in slices and every
// output buffer is fresh, so anything reaching before the current buffer comes from the sliding
// window. That is the shape that hid the inffast window-wrap bug, so this walks a seeded matrix of
// corpora, levels and buffer splits through it and checks every result against node:zlib.

const ITERATIONS = 60;

let seed = 20260905;
function random(bound: number): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed % bound;
}

const WORDS = [
  "state",
  "window",
  "inflate",
  "distance",
  "return Z_DATA_ERROR;",
  "buffer",
  "}",
  "if (x) {",
  "\n",
  "aaaaaaaa",
  "length",
  "copy",
];

function buildCorpus(): Uint8Array {
  const kind = random(4);
  const target = 40000 + random(400000);
  if (kind == 0) {
    const data = new Uint8Array(target);
    for (let index = 0; index < target; index++) {
      data[index] = random(256);
    }
    return data;
  }
  if (kind == 1) {
    const data = new Uint8Array(target);
    const period = 1 + random(4096);
    for (let index = 0; index < target; index++) {
      data[index] = (index % period) & 0xff;
    }
    return data;
  }
  const parts: string[] = [];
  let length = 0;
  while (length < target) {
    const word = WORDS[random(WORDS.length)];
    parts.push(word);
    length += word.length + 1;
  }
  const text = new TextEncoder().encode(parts.join(" "));
  if (kind == 3) {
    // incompressible islands inside text, which puts stored blocks between the long matches
    for (let start = random(50000); start < text.length - 300; start += 30000 + random(50000)) {
      for (let index = 0; index < 200; index++) {
        text[start + index] = random(256);
      }
    }
  }
  return text;
}

function streamingInflate(input: Uint8Array, wbits: number, inChunk: number, outSize: number): Uint8Array {
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

const IN_CHUNKS = [1024, 4096, 8192, 16384, 32768, 65536, 300, 12345];
const OUT_SIZES = [512, 1024, 4096, 16384, 32768, 65536, 131072, 777];

describe("Inflate: streaming differential against node:zlib", () => {
  it("decodes every corpus, level and buffer split the same way zlib does", () => {
    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      const source = buildCorpus();
      const level = random(10);
      const format = random(3);
      const wbits = format == 0 ? 15 : format == 1 ? -15 : 15 + 16;
      const compressed = new Uint8Array(
        format == 0
          ? zlib.deflateSync(source, { level })
          : format == 1
            ? zlib.deflateRawSync(source, { level })
            : zlib.gzipSync(source, { level }),
      );
      const inChunk = IN_CHUNKS[random(IN_CHUNKS.length)];
      const outSize = OUT_SIZES[random(OUT_SIZES.length)];
      const output = streamingInflate(compressed, wbits, inChunk, outSize);
      assertArraysEqual(
        output,
        source,
        `iteration ${iteration}: ${source.length} bytes, level ${level}, wbits ${wbits}, in ${inChunk}, out ${outSize}`,
      );
    }
  });
});
