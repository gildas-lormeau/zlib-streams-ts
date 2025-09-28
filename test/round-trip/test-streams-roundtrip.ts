import { describe, it } from "node:test";
import assert from "node:assert";

import { CompressionStream, DecompressionStream } from "../../src/index";
import { assertArraysEqual } from "../common/utils";

describe("Streams: roundtrip", () => {
  it("CompressionStream -> DecompressionStream roundtrip with small chunks", async () => {
    const input = new TextEncoder().encode("The quick brown fox jumps over the lazy dog".repeat(10));
    // Build a ReadableStream that emits small chunks of the input.
    const source = new ReadableStream<Uint8Array>({
      start(controller): void {
        for (let i = 0; i < input.length; i += 7) {
          controller.enqueue(input.subarray(i, Math.min(i + 7, input.length)));
        }
        controller.close();
      },
    });

    const comp = new CompressionStream("deflate");
    const decomp = new DecompressionStream("deflate");

    // sink collects decompressed output
    const outParts: Uint8Array[] = [];
    const sink = new WritableStream<Uint8Array>({
      write(chunk): void {
        if (chunk) {
          outParts.push(chunk.slice());
        }
      },
    });

    // Start the pipeline: source -> comp -> decomp -> sink
    const p1 = source.pipeTo(comp.writable);
    const p2 = comp.readable.pipeTo(decomp.writable);
    const p3 = decomp.readable.pipeTo(sink);

    await Promise.all([p1, p2, p3]);

    const total = outParts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const p of outParts) {
      out.set(p, pos);
      pos += p.length;
    }

    assert.strictEqual(out.length, input.length);
    assertArraysEqual(out, input, "roundtrip data differs");
  });
  it("CompressionStream -> DecompressionStream simple roundtrip", async () => {
    const inputText = "The quick brown fox jumps over the lazy dog".repeat(10);
    const inputStream = new Blob([new TextEncoder().encode(inputText)]).stream();

    const transformStream = new TransformStream<Uint8Array, Uint8Array>();
    const blobPromise = new Response(transformStream.readable).blob();

    const compressionStream = new CompressionStream("deflate");
    const decompressionStream = new DecompressionStream("deflate");

    inputStream.pipeThrough(compressionStream).pipeThrough(decompressionStream).pipeTo(transformStream.writable);

    const blob = await blobPromise;
    const arrayBuffer = await blob.arrayBuffer();
    const output = new Uint8Array(arrayBuffer);

    const expected = new TextEncoder().encode(inputText);
    assert.strictEqual(output.length, expected.length);
    assertArraysEqual(output, expected, "roundtrip data differs");
  });
});
