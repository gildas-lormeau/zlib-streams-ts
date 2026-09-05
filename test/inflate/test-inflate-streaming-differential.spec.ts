import { describe, it } from "node:test";
import * as zlib from "node:zlib";
import { assertArraysEqual, streamingInflate } from "../common/utils";

// streamingInflate drives the codec the way the streams API does, which is the shape that hid the
// inffast window-wrap bug. This walks a seeded matrix of corpora, levels and buffer splits through
// it and checks every result against node:zlib.

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
