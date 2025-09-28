import { describe, it } from "node:test";
import assert from "node:assert";

import { CompressionStream, DecompressionStream } from "../../src/index";
import { assertArraysEqual } from "../common/utils";

describe("Streams: perf", () => {
  it("should roundtrip various buffer sizes and stream types", async () => {
    const sizes = [1024 * 1024, 10 * 1024 * 1024, 32 * 1024 * 1024];
    const types: Array<"deflate" | "gzip" | "deflate-raw"> = ["deflate", "gzip", "deflate-raw"];

    for (let si = 0; si < sizes.length; ++si) {
      const size = sizes[si];
      const data = new Uint8Array(size);
      for (let j = 0; j < size; ++j) {
        data[j] = j % 251;
      }

      for (const t of types) {
        // Use Blob stream pipeline similar to other round-trip tests
        const inputStream = new Blob([data]).stream();

        const transformStream = new TransformStream<Uint8Array, Uint8Array>();
        const blobPromise = new Response(transformStream.readable).blob();

        const compressionStream = new CompressionStream(t, { level: 9 });
        const decompressionStream = new DecompressionStream(t);

        inputStream.pipeThrough(compressionStream).pipeThrough(decompressionStream).pipeTo(transformStream.writable);

        const blob = await blobPromise;
        const arrayBuffer = await blob.arrayBuffer();
        const output = new Uint8Array(arrayBuffer);

        assert.strictEqual(output.length, data.length, `length mismatch for type=${t} size=${size}`);
        assertArraysEqual(output, data, `roundtrip data differs for type=${t} size=${size}`);
      }
    }
  });
});
