import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

import {
  createInflateStream,
  inflateInit,
  inflate,
  inflateEnd,
  Z_OK,
  Z_STREAM_END,
  Z_FINISH,
  Z_NO_FLUSH,
} from "../../src/index";

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

describe("inflate9: chunked input streaming", () => {
  const fixture = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../data/10k_lines.deflate64");

  it("should produce identical output when fed in small input chunks", () => {
    const data = fs.readFileSync(fixture);
    const input = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    // First, get a reference output with a single-shot large output buffer.
    const singleOut = new Uint8Array(1024 * 1024 * 8);
    const s1 = createInflateStream(true);
    let r = inflateInit(s1);
    assert.strictEqual(r, Z_OK);
    s1.next_in = input;
    s1.next_in_index = 0;
    s1.avail_in = input.length;
    s1.next_out = singleOut;
    s1.next_out_index = 0;
    s1.avail_out = singleOut.length;
    do {
      r = inflate(s1, Z_FINISH);
      if (r !== Z_OK && r !== Z_STREAM_END) {
        throw new Error(`inflate single-shot returned unexpected code: ${r}`);
      }
    } while (r !== Z_STREAM_END);
    const written = singleOut.length - s1.avail_out;
    assert.ok(written > 0, `single-shot produced no output`);
    const expected = singleOut.subarray(0, written);
    r = inflateEnd(s1);
    assert.strictEqual(r, Z_OK);

    // Now stream the input in small chunks and collect output chunks.
    const chunks: Uint8Array[] = [];
    const s2 = createInflateStream(true);
    r = inflateInit(s2);
    assert.strictEqual(r, Z_OK);

    const inChunk = 1024; // 1 KiB input chunks
    const outChunk = 16 * 1024; // 16 KiB output chunks

    let pos = 0;
    let finished = false;
    while (!finished) {
      const avail = Math.min(inChunk, input.length - pos);
      const isLastChunk = pos + avail >= input.length;
      s2.next_in = input;
      s2.next_in_index = pos;
      s2.avail_in = avail;

      const outBuf = new Uint8Array(outChunk);
      s2.next_out = outBuf;
      s2.next_out_index = 0;
      s2.avail_out = outBuf.length;

      r = inflate(s2, isLastChunk ? Z_FINISH : Z_NO_FLUSH);
      if (r !== Z_OK && r !== Z_STREAM_END) {
        throw new Error(`inflate chunked returned unexpected code: ${r}`);
      }

      const wrote = outBuf.length - s2.avail_out;
      if (wrote > 0) {
        chunks.push(outBuf.subarray(0, wrote));
      }

      // advance pos by how much the stream consumed from the provided input
      // inflate9 updates next_in_index/avail_in
      pos = s2.next_in_index;

      if (r === Z_STREAM_END) {
        finished = true;
      } else if (pos >= input.length && s2.avail_in === 0) {
        // No more input available from fixture; call again with zero avail_in to flush
        // but ensure loop terminates if it cannot make progress
        if (s2.avail_out === outBuf.length && wrote === 0) {
          // nothing produced and no input left -> failure
          throw new Error("inflate9 did not finish and produced no output with no input left");
        }
        if (pos >= input.length && r === Z_OK) {
          // continue to let inflate flush remaining output
          continue;
        }
      }
    }

    const actual = concat(chunks);
    assert.strictEqual(actual.length, expected.length, "decompressed length mismatch");
    // compare contents
    for (let i = 0; i < expected.length; i++) {
      if (expected[i] !== actual[i]) {
        assert.fail(`byte mismatch at ${i}: expected ${expected[i]} got ${actual[i]}`);
      }
    }

    r = inflateEnd(s2);
    assert.strictEqual(r, Z_OK);
  });
});
