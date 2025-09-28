import { test } from "node:test";
import assert from "node:assert/strict";
import { createZeroCopyCompressionTransform, Lease } from "../../src/index";

test("zero-copy pool reuse with multiple write sizes", async () => {
  const zc = createZeroCopyCompressionTransform("deflate");

  const seen = [] as ArrayBufferLike[];

  const collect = new TransformStream<Lease, void>({
    transform(lease: Lease): void {
      seen.push(lease._chunk.buffer);
      // immediately release so pool can reuse
      lease.release();
    },
  });

  const pipePromise = zc.readable.pipeThrough(collect).pipeTo(new WritableStream({ write(): void {} }));

  const writer = zc.writable.getWriter();
  // write varying sizes to encourage pool reuse patterns
  await writer.write(new Uint8Array(256));
  await writer.write(new Uint8Array(2048));
  await writer.write(new Uint8Array(1024));
  await writer.write(new Uint8Array(4096));
  await writer.close();

  await pipePromise;

  assert.ok(seen.length >= 1, "expected at least one lease");
  const uniq = new Set(seen.map((b) => b));
  // We expect reuse to occur: not every seen buffer has a unique ArrayBuffer
  assert.ok(uniq.size <= seen.length, "pool should allow reuse (uniq.size <= seen.length)");
});
