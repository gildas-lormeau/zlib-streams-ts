import { Z_DEFLATED, Z_NO_FLUSH, Z_FINISH, Z_OK, Z_STREAM_END, Z_DEFAULT_COMPRESSION } from "./common/constants";
import { createDeflateStream, deflateInit2_, deflate, deflateEnd } from "./deflate";
import { createInflateStream, inflateInit2_, inflate, inflateEnd } from "./inflate";
import type { Stream } from "./common/types";

const DEFAULT_OUT_BUFFER = 64 * 1024;
const IN_CHUNK = 32 * 1024;

export type Lease = { _chunk: Uint8Array; release: () => void };

class BufferPool {
  private _pool: Uint8Array[];
  private _maxSize: number;
  constructor(maxSize = 16, bufSize = DEFAULT_OUT_BUFFER) {
    this._pool = [];
    this._maxSize = maxSize;
    for (let i = 0; i < Math.min(maxSize, 4); i++) {
      this._pool.push(new Uint8Array(bufSize));
    }
  }

  acquire(bufSize = DEFAULT_OUT_BUFFER): Uint8Array {
    for (let i = this._pool.length - 1; i >= 0; i--) {
      const b = this._pool[i];
      if (b.length >= bufSize) {
        this._pool.splice(i, 1);
        return b;
      }
    }
    return new Uint8Array(bufSize);
  }

  release(b: Uint8Array): void {
    if (this._pool.length < this._maxSize) {
      this._pool.push(b);
    }
  }
}

export function createZeroCopyZlibTransform<TStream extends Stream>(opts: {
  _createStream: () => TStream;
  _init: (s: TStream) => number;
  _process: (s: TStream, flush: number) => number;
  _end: (s: TStream) => number;
}): TransformStream<Uint8Array, Lease> {
  const pool = new BufferPool(32, DEFAULT_OUT_BUFFER);
  let state: { _strm: TStream } | null = null;

  function release(outBuf: Uint8Array): void {
    try {
      pool.release(outBuf);
    } catch {
      // ignored
    }
  }

  return new TransformStream<Uint8Array, Lease>({
    start(): void {},
    transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Lease>): void {
      if (!state) {
        const s = opts._createStream();
        const initRet = opts._init(s);
        if (initRet != 0 && initRet != Z_OK) {
          throw new Error("init failed: " + initRet);
        }
        state = { _strm: s };
      }

      const strm: TStream = state._strm;
      let readOffset = 0;
      while (readOffset < chunk.length) {
        const toRead = Math.min(chunk.length - readOffset, IN_CHUNK);
        const sub = chunk.subarray(readOffset, readOffset + toRead);
        strm.next_in = sub;
        strm.next_in_index = 0;
        strm.avail_in = sub.length;

        while (strm.avail_in > 0) {
          const outBuf = pool.acquire();
          let leased = false;
          try {
            strm.next_out = outBuf;
            strm.next_out_index = 0;
            strm.avail_out = outBuf.length;

            const r = opts._process(strm, Z_NO_FLUSH);
            const produced = outBuf.length - strm.avail_out;
            if (produced > 0) {
              let released = false;
              const view = outBuf.subarray(0, produced);
              const lease: Lease = {
                _chunk: view,
                release: () => {
                  if (released) {
                    return;
                  }
                  released = true;
                  pool.release(outBuf);
                },
              };
              leased = true;
              controller.enqueue(lease);
            }

            if (r != Z_OK && r != Z_STREAM_END) {
              throw new Error("process error: " + r);
            }
          } finally {
            if (!leased) {
              release(outBuf);
            }
          }
        }

        readOffset += toRead;
      }
    },
    flush(controller: TransformStreamDefaultController<Lease>): void {
      if (!state) {
        return;
      }
      const strm: TStream = state._strm;
      while (true) {
        const outBuf = pool.acquire();
        let leased = false;
        try {
          strm.next_out = outBuf;
          strm.next_out_index = 0;
          strm.avail_out = outBuf.length;

          const r = opts._process(strm, Z_FINISH);
          const produced = outBuf.length - strm.avail_out;
          if (produced > 0) {
            let released = false;
            const view = outBuf.subarray(0, produced);
            const lease: Lease = {
              _chunk: view,
              release: () => {
                if (released) {
                  return;
                }
                released = true;
                pool.release(outBuf);
              },
            };
            leased = true;
            controller.enqueue(lease);
          }
          if (r == Z_STREAM_END) {
            break;
          }
          if (r != Z_OK) {
            throw new Error("finalization error: " + r);
          }
        } finally {
          if (!leased) {
            release(outBuf);
          }
        }
      }
      const endRet = opts._end(strm);
      if (endRet != Z_OK && endRet != 0) {
        throw new Error("end failed: " + endRet);
      }
    },
  });
}

export function runWithLease<T>(lease: Lease, fn: (chunk: Uint8Array) => T): T {
  try {
    return fn(lease._chunk);
  } finally {
    lease.release();
  }
}

export async function runWithLeaseAsync<T>(lease: Lease, fn: (chunk: Uint8Array) => Promise<T>): Promise<T> {
  try {
    return await fn(lease._chunk);
  } finally {
    lease.release();
  }
}

export function zeroCopyToStandard(): TransformStream<Lease, Uint8Array> {
  return new TransformStream<Lease, Uint8Array>({
    start(): void {},
    transform(lease: Lease, controller: TransformStreamDefaultController<Uint8Array>): void {
      try {
        controller.enqueue(lease._chunk.slice(0));
      } finally {
        lease.release();
      }
    },
    flush(): void {},
  });
}

export function createZeroCopyCompressionTransform(
  type: "deflate" | "gzip" | "deflate-raw" = "deflate",
  options?: { level?: number },
): TransformStream<Uint8Array, Lease> {
  const wbits = type == "gzip" ? 15 + 16 : type == "deflate-raw" ? -15 : 15;
  const level = options && typeof options.level == "number" ? options.level : Z_DEFAULT_COMPRESSION;
  return createZeroCopyZlibTransform({
    _createStream: () => createDeflateStream(),
    _init: (s) => deflateInit2_(s, level, Z_DEFLATED, wbits, 8, 0),
    _process: deflate,
    _end: deflateEnd,
  });
}

export function createZeroCopyDecompressionTransform(
  type: "deflate" | "gzip" | "deflate-raw" | "deflate64-raw" = "deflate",
): TransformStream<Uint8Array, Lease> {
  const wbits = type == "gzip" ? 15 + 16 : type == "deflate-raw" ? -15 : 15;
  return createZeroCopyZlibTransform({
    _createStream: () => createInflateStream(type == "deflate64-raw"),
    _init: (s) => inflateInit2_(s, wbits),
    _process: inflate,
    _end: inflateEnd,
  });
}

export class CompressionStream {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;

  constructor(type: "deflate" | "gzip" | "deflate-raw" = "deflate", options?: { level?: number }) {
    const zc = createZeroCopyCompressionTransform(type, options);
    this.writable = zc.writable;
    this.readable = zc.readable.pipeThrough(zeroCopyToStandard());
  }
}

export class DecompressionStream {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;

  constructor(type: "deflate" | "gzip" | "deflate-raw" | "deflate64-raw" = "deflate") {
    const zc = createZeroCopyDecompressionTransform(type);
    this.writable = zc.writable;
    this.readable = zc.readable.pipeThrough(zeroCopyToStandard());
  }
}
