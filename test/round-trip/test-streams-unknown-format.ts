import { describe, it } from "node:test";
import assert from "node:assert";

import { CompressionStream, DecompressionStream } from "../../src/index";

// An unknown format is rejected with a TypeError when the stream is constructed, as the platform
// CompressionStream and DecompressionStream do. The transforms used to map any other string to the
// zlib wrapper, so a typo in the format silently produced or consumed zlib data. The default stays
// "deflate", and the formats each class supports still construct.
describe("Streams: unknown format", () => {
  const unsupported = /Unsupported format/;
  const unknownFormats = ["inflate", "zlib", "DEFLATE", "deflate-raw ", ""];
  const compressionFormats: Array<"deflate" | "gzip" | "deflate-raw"> = ["deflate", "gzip", "deflate-raw"];
  const decompressionFormats: Array<"deflate" | "gzip" | "deflate-raw" | "deflate64-raw"> = [
    "deflate",
    "gzip",
    "deflate-raw",
    "deflate64-raw",
  ];

  async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const arrayBuffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  function source(chunk: Uint8Array): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start(controller): void {
        controller.enqueue(chunk);
        controller.close();
      },
    });
  }

  for (const format of unknownFormats) {
    it(`CompressionStream rejects ${JSON.stringify(format)}`, () => {
      assert.throws(() => new CompressionStream(format as never), TypeError);
      assert.throws(() => new CompressionStream(format as never), unsupported);
    });

    it(`DecompressionStream rejects ${JSON.stringify(format)}`, () => {
      assert.throws(() => new DecompressionStream(format as never), TypeError);
      assert.throws(() => new DecompressionStream(format as never), unsupported);
    });
  }

  it("CompressionStream rejects deflate64-raw, a decompression-only format", () => {
    assert.throws(() => new CompressionStream("deflate64-raw" as never), unsupported);
  });

  it("the classes reject null and a non-string format", () => {
    assert.throws(() => new CompressionStream(null as never), unsupported);
    assert.throws(() => new DecompressionStream(42 as never), unsupported);
  });

  for (const format of compressionFormats) {
    it(`CompressionStream constructs with ${format}`, () => {
      assert.ok(new CompressionStream(format));
    });
  }

  for (const format of decompressionFormats) {
    it(`DecompressionStream constructs with ${format}`, () => {
      assert.ok(new DecompressionStream(format));
    });
  }

  it("the default format is still deflate on both classes", async () => {
    const content = new TextEncoder().encode("Hello World".repeat(1000));
    const compressed = await collect(source(content).pipeThrough(new CompressionStream()));
    assert.strictEqual(compressed[0], 0x78);
    const decompressed = await collect(source(compressed).pipeThrough(new DecompressionStream()));
    assert.deepStrictEqual(decompressed, content);
  });
});
