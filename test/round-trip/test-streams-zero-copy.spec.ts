import { describe, it } from "node:test";
import assert from "node:assert";

import { createZeroCopyCompressionTransform, zeroCopyToStandard, CompressionStream } from "../../src/index";
import { assertArraysEqual } from "../common/utils";

describe("Streams: zero-copy", () => {
  it("leases must provide release() and adapter produces identical bytes", async () => {
    const inputText = "The quick brown fox jumps over the lazy dog".repeat(20);
    const input = new TextEncoder().encode(inputText);

    // Build a simple readable stream with a single chunk
    const rs = new ReadableStream<Uint8Array>({
      start(ctrl): void {
        ctrl.enqueue(input);
        ctrl.close();
      },
    });

    // zero-copy compression transform + adapter
    const zc = createZeroCopyCompressionTransform("deflate");
    const adapter = zeroCopyToStandard();

    // Spy transform: wraps each lease.release to count calls so we can assert
    // that release() is invoked (by the adapter or downstream code).
    let releaseCount = 0;
    const spy = new TransformStream<any, any>({
      transform(lease: any, controller: TransformStreamDefaultController<any>): void {
        const orig = lease.release;
        lease.release = (): void => {
          try {
            orig();
          } finally {
            releaseCount++;
          }
        };
        controller.enqueue(lease);
      },
    });

    // Pipe through zc -> spy -> adapter to get an ordinary TransformStream
    const ts = rs.pipeThrough(zc).pipeThrough(spy).pipeThrough(adapter);

    // Collect output
    const parts: Uint8Array[] = [];
    const sink = new WritableStream<Uint8Array>({
      write(chunk): void {
        parts.push(chunk.slice());
      },
    });

    await ts.pipeTo(sink);

    const total = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const p of parts) {
      out.set(p, pos);
      pos += p.length;
    }

    // Compare against the default CompressionStream -> collect bytes
    const expectedParts: Uint8Array[] = [];
    const csr = new ReadableStream<Uint8Array>({
      start(ctrl): void {
        ctrl.enqueue(input);
        ctrl.close();
      },
    });
    const comp = new CompressionStream("deflate");
    const sink2 = new WritableStream<Uint8Array>({
      write(chunk): void {
        expectedParts.push(chunk.slice());
      },
    });
    await csr.pipeThrough(comp).pipeTo(sink2);
    const expectedTotal = expectedParts.reduce((s, p) => s + p.length, 0);
    const expected = new Uint8Array(expectedTotal);
    pos = 0;
    for (const p of expectedParts) {
      expected.set(p, pos);
      pos += p.length;
    }

    assert.strictEqual(out.length, expected.length, "length differs between adapter and standard compress");
    assertArraysEqual(out, expected, "adapter output differs from standard CompressionStream");

    // Ensure release() was called for at least one lease (adapter should
    // call release() as it converts leases to copied Uint8Arrays).
    assert.ok(releaseCount > 0, "expected release() to be called by adapter");
  });
});
