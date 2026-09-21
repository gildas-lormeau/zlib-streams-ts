import { describe, it } from "node:test";
import assert from "node:assert";

import { CompressionStream, DecompressionStream } from "../../src/index";

// Bytes after the end of a stream are rejected, as the platform DecompressionStream does (Node, Deno
// and Chrome error on trailing data, a second gzip member included). The transform used to stop at the
// end of the stream and drop whatever followed, so a caller feeding a stream with a wrong length read
// the content and never learned about it.
describe("Streams: trailing data", () => {
  const types: Array<"deflate" | "gzip" | "deflate-raw"> = ["deflate", "gzip", "deflate-raw"];
  const trailingData = /trailing data after the end of the stream/;
  const junk = new Uint8Array([0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a]);
  const content = new Uint8Array(100000);
  for (let index = 0; index < content.length; index++) {
    content[index] = index % 7 ? 65 + ((index * 7919) % 16) : 10;
  }

  async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const arrayBuffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  function source(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start(controller): void {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });
  }

  function concat(first: Uint8Array, second: Uint8Array): Uint8Array {
    const result = new Uint8Array(first.length + second.length);
    result.set(first);
    result.set(second, first.length);
    return result;
  }

  for (const t of types) {
    it(`type=${t} decompresses a stream ending at its last byte`, async () => {
      const compressed = await collect(source([content]).pipeThrough(new CompressionStream(t)));
      const decompressed = await collect(source([compressed]).pipeThrough(new DecompressionStream(t)));
      assert.deepStrictEqual(decompressed, content);
    });

    it(`type=${t} rejects junk in the chunk that ends the stream`, async () => {
      const compressed = await collect(source([content]).pipeThrough(new CompressionStream(t)));
      await assert.rejects(
        collect(source([concat(compressed, junk)]).pipeThrough(new DecompressionStream(t))),
        trailingData,
      );
    });

    it(`type=${t} rejects junk in a later chunk`, async () => {
      const compressed = await collect(source([content]).pipeThrough(new CompressionStream(t)));
      await assert.rejects(
        collect(source([compressed, new Uint8Array(0), junk]).pipeThrough(new DecompressionStream(t))),
        trailingData,
      );
    });

    it(`type=${t} rejects a second stream after the first`, async () => {
      const compressed = await collect(source([content]).pipeThrough(new CompressionStream(t)));
      await assert.rejects(
        collect(source([compressed, compressed]).pipeThrough(new DecompressionStream(t))),
        trailingData,
      );
    });
  }
});
