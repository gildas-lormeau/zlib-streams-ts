import { describe, it } from "node:test";
import assert from "node:assert";

import { CompressionStream, DecompressionStream } from "../../src/index";

describe("Streams: empty input", () => {
  const types: Array<"deflate" | "gzip" | "deflate-raw"> = ["deflate", "gzip", "deflate-raw"];
  const levels: Array<number | undefined> = [undefined, 0, 9];

  async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const arrayBuffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  for (const t of types) {
    for (const lvl of levels) {
      const lvlName = typeof lvl === "number" ? String(lvl) : "default";
      it(`type=${t} level=${lvlName} compresses empty input to a valid stream`, async () => {
        const opts = typeof lvl === "number" ? { level: lvl } : undefined;
        const compressionStream = opts ? new CompressionStream(t, opts) : new CompressionStream(t);
        const compressed = await collect(new Blob([]).stream().pipeThrough(compressionStream));
        assert.ok(compressed.length > 0, `empty ${t} stream must not be zero bytes`);

        const decompressed = await collect(
          new Blob([compressed]).stream().pipeThrough(new DecompressionStream(t)),
        );
        assert.strictEqual(decompressed.length, 0);
      });
    }
  }

  it("type=deflate-raw compresses empty input to the empty final block", async () => {
    const compressed = await collect(new Blob([]).stream().pipeThrough(new CompressionStream("deflate-raw")));
    assert.deepStrictEqual(Array.from(compressed), [3, 0]);
  });

  for (const t of types) {
    it(`type=${t} rejects empty input as truncated when decompressing`, async () => {
      await assert.rejects(collect(new Blob([]).stream().pipeThrough(new DecompressionStream(t))));
    });
  }
});
