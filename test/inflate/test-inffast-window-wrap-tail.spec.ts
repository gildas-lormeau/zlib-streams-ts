import { describe, it } from "node:test";
import assert from "node:assert";
import * as zlib from "node:zlib";
import { chunkedInflate, assertArraysEqual } from "../common/utils";
import { DecompressionStream } from "../../src/mod/streams";

// inffast copies a match either from the sliding window or from the output buffer, and zlib keeps a
// single `from` pointer that can address both. This port holds them in two separate arrays, so every
// path that ends a copy inside the window must finish there instead of falling through to the shared
// tail, which reads the output buffer. The path exercised here is the wrap-around branch
// (wnext < op) with a match ending inside the wrapped region: the tail used to read output[0..]
// instead of window[0..]. Both corpora below are sized and seeded to reach that path, which needs a
// window that has already wrapped and a match straddling the wrap point.

const WINDOW_SIZE = 32 * 1024;

const SHORT_WORDS = [
  "state",
  "window",
  "inflate",
  "distance",
  "length",
  "output",
  "buffer",
  "stream",
  "deflate64",
  "checksum",
  "the",
  "of",
  "copy",
  "wrap",
];

const CODE_FRAGMENTS = [
  "if (state->mode == LEN) {",
  "strm->msg = (char *)",
  "state->offset = (unsigned)",
  "return Z_DATA_ERROR;",
  "unsigned char FAR *from;",
  "state->length = (unsigned)here.val;",
  "hold += (unsigned long)(*next++) << bits;",
  "bits += 8;",
  "case LENLENS:",
  "break;",
  "}",
  "\n",
];

function buildSource(words: string[], seed: number, count: number): Uint8Array {
  const parts: string[] = [];
  for (let index = 0; index < count; index++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    parts.push(words[seed % words.length]);
    if (index % 12 == 11) {
      parts.push("\n");
    }
  }
  return new TextEncoder().encode(parts.join(" "));
}

async function decompressStream(compressed: Uint8Array, format: "deflate" | "deflate-raw"): Promise<Uint8Array> {
  const stream = new DecompressionStream(format);
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  const readerTask = (async (): Promise<void> => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value as Uint8Array);
    }
  })();
  const writer = stream.writable.getWriter();
  await writer.write(compressed);
  await writer.close();
  await readerTask;
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    output.set(chunk, position);
    position += chunk.length;
  }
  return output;
}

describe("Inflate: inffast window wrap tail", () => {
  it("copies the tail of a wrapped match from the window, not from the output buffer", () => {
    const source = buildSource(SHORT_WORDS, 987654321, 40000);
    assert.ok(source.length > 4 * WINDOW_SIZE, "the source must be long enough to wrap the window");
    for (const level of [6, 9]) {
      const compressed = new Uint8Array(zlib.deflateSync(source, { level }));
      // the output chunk must leave room for inflate_fast (left >= 258), and the input must arrive
      // in several slices, so that matches reach back past the start of the current output chunk
      for (const [chunkInput, chunkOutput] of [
        [32 * 1024, 64 * 1024],
        [16 * 1024, 64 * 1024],
        [8 * 1024, 32 * 1024],
        [4 * 1024, 4 * 1024],
      ]) {
        const output = new Uint8Array(source.length + 32);
        const length = chunkedInflate(
          compressed,
          compressed.length,
          output,
          output.length,
          15,
          chunkInput,
          chunkOutput,
        );
        assert.strictEqual(length, source.length, `level ${level}, ${chunkInput}/${chunkOutput}`);
        assertArraysEqual(output.subarray(0, length), source, `level ${level}, ${chunkInput}/${chunkOutput}`);
      }
    }
  });

  it("decodes through the streams api, where a wrong copy is silent on raw streams", async () => {
    // the streams api feeds 32 KB input slices into fresh 64 KB output buffers, so every match
    // reaching before the current buffer comes from the window; this corpus reaches the wrapped
    // tail under that split, where deflate fails the adler32 check and deflate-raw stays silent
    const source = buildSource(CODE_FRAGMENTS, 2024, 80000);
    for (const format of ["deflate", "deflate-raw"] as const) {
      const compressed = new Uint8Array(
        format == "deflate" ? zlib.deflateSync(source, { level: 9 }) : zlib.deflateRawSync(source, { level: 9 }),
      );
      const output = await decompressStream(compressed, format);
      assertArraysEqual(output, source, format);
    }
  });
});
