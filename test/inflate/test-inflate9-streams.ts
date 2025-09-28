import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

import { createInflateStream, inflateInit, inflate, inflateEnd, Z_OK, Z_STREAM_END, Z_FINISH } from "../../src/index";

import { DecompressionStream } from "../../src/index";

function findFixtures(): string[] {
  const candidates: string[] = [];
  const thisFile = new URL(import.meta.url);
  const base = path.resolve(path.dirname(thisFile.pathname), "../data");
  try {
    const names = fs.readdirSync(base);
    for (const n of names) {
      if (n.endsWith(".deflate64")) {
        candidates.push(path.join(base, n));
      }
    }
  } catch {
    // ignore missing dir
  }
  return candidates;
}

async function streamDecompress(input: Uint8Array): Promise<Uint8Array> {
  // Use the DecompressionStream('deflate64-raw') to decompress the input via web-style streams
  const ds = new DecompressionStream("deflate64-raw");
  // Create a ReadableStream from the input that emits smaller chunks to exercise streaming
  const CHUNK = 16 * 1024;
  const rs = new ReadableStream<Uint8Array>({
    start(ctrl): void {
      for (let i = 0; i < input.length; i += CHUNK) {
        ctrl.enqueue(input.subarray(i, Math.min(i + CHUNK, input.length)));
      }
      ctrl.close();
    },
  });

  const collector: Uint8Array[] = [];
  const ws = new WritableStream<Uint8Array>({
    write(chunk): void {
      if (chunk) {
        collector.push(chunk.slice());
      }
    },
  });

  // pipe through decompressor
  const p1 = rs.pipeTo(ds.writable);
  const p2 = ds.readable.pipeTo(ws);
  await Promise.all([p1, p2]);

  // concat
  const total = collector.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of collector) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function singleShotInflate(input: Uint8Array): Uint8Array {
  const out = new Uint8Array(1024 * 1024 * 8);
  const s = createInflateStream(true);
  let r = inflateInit(s);
  assert.strictEqual(r, Z_OK, `inflateInit failed: ${r}`);
  s.next_in = input;
  s.next_in_index = 0;
  s.avail_in = input.length;
  s.next_out = out;
  s.next_out_index = 0;
  s.avail_out = out.length;
  do {
    r = inflate(s, Z_FINISH);
    if (r !== Z_OK && r !== Z_STREAM_END) {
      throw new Error(`inflate returned unexpected code: ${r}`);
    }
  } while (r !== Z_STREAM_END);
  const written = out.length - s.avail_out;
  const res = out.subarray(0, written);
  r = inflateEnd(s);
  assert.strictEqual(r, Z_OK, `inflateEnd failed: ${r}`);
  return res;
}

describe("inflate9: stream-based deflate64 fixtures", () => {
  const fixtures = findFixtures();
  for (const fixture of fixtures) {
    it(`inflate9 stream: ${path.relative(process.cwd(), fixture)}`, async () => {
      const data = fs.readFileSync(fixture);
      const input = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

      // get single-shot reference
      const expected = singleShotInflate(input);

      // get streamed output
      const actual = await streamDecompress(input);

      assert.strictEqual(actual.length, expected.length, `length mismatch for ${fixture}`);
      for (let i = 0; i < expected.length; i++) {
        if (expected[i] !== actual[i]) {
          assert.fail(`byte mismatch at ${i}: expected ${expected[i]} got ${actual[i]}`);
        }
      }
    });
  }
});
