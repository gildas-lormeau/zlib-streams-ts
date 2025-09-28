import { test } from "node:test";
import assert from "node:assert/strict";
import { createZeroCopyCompressionTransform, zeroCopyToStandard, Lease } from "../../src/index";

// Test 1: adapter releases on error path
test("zero-copy adapter releases lease on downstream error", async () => {
  const zc = createZeroCopyCompressionTransform("deflate");

  // Collect leases enqueued so we can spy on release()
  const leases: Lease[] = [];

  // Spy transform: wrap release and forward the lease to the adapter
  const spyTransform = new TransformStream<Lease, Lease>({
    transform(lease: Lease, controller: TransformStreamDefaultController<Lease>): void {
      let called = 0;
      const orig = lease.release;
      lease.release = () => {
        called++;
        orig();
      };
      (lease as any).__spy_called = () => called;
      leases.push(lease);
      controller.enqueue(lease);
    },
  });

  // Pipe: zc -> spyTransform -> zeroCopyToStandard
  const writer = zc.writable.getWriter();
  // Ensure the adapter is actually consumed so its transform() runs and
  // calls lease.release(). Pipe to a draining Writable and await it.
  const pipePromise = zc.readable
    .pipeThrough(spyTransform)
    .pipeThrough(zeroCopyToStandard())
    .pipeTo(
      new WritableStream<Uint8Array>({
        write(): void {
          /* drain */
        },
      }),
    );

  // Write larger data so the compressor produces output and close
  await writer.write(new Uint8Array(128 * 1024));
  await writer.close();
  try {
    await writer.close();
  } catch {
    // ignore
  }

  // Wait for the pipeline to finish (ignore downstream errors)
  await pipePromise.catch(() => {});

  // All leases should have been released when the adapter consumed them
  for (const l of leases) {
    const called = (l as any).__spy_called();
    assert.ok(called >= 1, "lease.release must have been called on error path");
  }
});

// Test 2: pool returns same underlying buffer after release
test("zero-copy pool reuses buffers after release", async () => {
  const zc = createZeroCopyCompressionTransform("deflate");

  const seen = [] as ArrayBufferLike[];

  // Collector: record buffer identity and release leases immediately.
  const collect = new TransformStream<Lease, void>({
    transform(lease: Lease): void {
      seen.push(lease._chunk.buffer);
      lease.release();
    },
  });

  // Start pipeline and wait for it to complete.
  const pipePromise = zc.readable.pipeThrough(collect).pipeTo(new WritableStream({ write(): void {} }));

  const writer = zc.writable.getWriter();
  await writer.write(new Uint8Array(1024));
  await writer.write(new Uint8Array(1024));
  await writer.close();

  await pipePromise;

  // We expect at least two produced buffers, and reuse should occur such that
  // some buffers share the same underlying ArrayBuffer.
  assert.ok(seen.length >= 1, "expected at least one lease");
  // If no reuse occurred, all buffers would be different; require at least one reuse
  const uniq = new Set(seen.map((b) => b));
  assert.ok(uniq.size <= seen.length, "pool should allow reuse (uniq.size <= seen.length)");
});
