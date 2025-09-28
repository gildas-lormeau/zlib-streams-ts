import { describe, it } from "node:test";
import assert from "node:assert";

import { CompressionStream, DecompressionStream } from "../../src/index";
import { assertArraysEqual } from "../common/utils";

describe("Streams: options", () => {
  const types: Array<"deflate" | "gzip" | "deflate-raw"> = ["deflate", "gzip", "deflate-raw"];
  const levels: Array<number | undefined> = [undefined, 0, 9];

  for (const t of types) {
    for (const lvl of levels) {
      const lvlName = typeof lvl === "number" ? String(lvl) : "default";
      it(`type=${t} level=${lvlName} roundtrip`, async () => {
        const inputText =
          `Roundtrip test for ${t} level=${lvlName} ` + "The quick brown fox jumps over the lazy dog".repeat(5);
        const inputStream = new Blob([new TextEncoder().encode(inputText)]).stream();

        const transformStream = new TransformStream<Uint8Array, Uint8Array>();
        const blobPromise = new Response(transformStream.readable).blob();

        const opts = typeof lvl === "number" ? { level: lvl } : undefined;
        const compressionStream = opts ? new CompressionStream(t, opts) : new CompressionStream(t);
        const decompressionStream = new DecompressionStream(t);

        // Pipe: blob -> compression -> decompression -> transform writable
        // Response(blob).arrayBuffer will resolve after the pipeline completes
        inputStream.pipeThrough(compressionStream).pipeThrough(decompressionStream).pipeTo(transformStream.writable);

        const blob = await blobPromise;
        const arrayBuffer = await blob.arrayBuffer();
        const output = new Uint8Array(arrayBuffer);

        const expected = new TextEncoder().encode(inputText);
        assert.strictEqual(output.length, expected.length);
        assertArraysEqual(output, expected, `roundtrip data differs for ${t} level=${lvlName}`);
      });
    }
  }
});
