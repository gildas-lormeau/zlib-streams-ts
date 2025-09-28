# Introduction

A high-performance TypeScript port of zlib, providing deflate and inflate compression algorithms with full compatibility to the original C library.

# Features

- **Complete zlib API**: Full implementation of deflate and inflate with all compression levels and strategies
- **Deflate64 Support**: Extended deflate algorithm for larger windows (up to 64KB)
- **Web Streams API**: Modern `CompressionStream` and `DecompressionStream` classes
- **Zero-copy streaming**: Efficient buffer management for high-throughput applications
- **TypeScript**: Fully typed with comprehensive type definitions
- **RFC Compliance**: Implements RFC 1950 (zlib), RFC 1951 (deflate), and RFC 1952 (gzip)

# Installation

```bash
npm install project-deflate-ts
```

# Usage

### Web Streams API (Recommended)

```typescript
import { CompressionStream, DecompressionStream } from 'project-deflate-ts';

// Compression
const compressor = new CompressionStream('deflate');
const compressed = await new Response('Hello World').body
  .pipeThrough(compressor)
  .getReader()
  .read();

// Decompression
const decompressor = new DecompressionStream('inflate');
const decompressed = await new Response(compressed.value).body
  .pipeThrough(decompressor)
  .getReader()
  .read();
```

## Low-level Stream API

```typescript
import {
  createDeflateStream,
  deflateInit,
  deflate,
  deflateEnd,
  createInflateStream,
  inflateInit,
  inflate,
  inflateEnd
} from 'project-deflate-ts';

// Compression
const deflateStream = createDeflateStream();
deflateInit(deflateStream, 6); // compression level 6

const input = new TextEncoder().encode('Hello World');
deflateStream.next_in = input;
deflateStream.avail_in = input.length;

const output = new Uint8Array(1024);
deflateStream.next_out = output;
deflateStream.avail_out = output.length;

deflate(deflateStream, Z_FINISH);
deflateEnd(deflateStream);

// Decompression
const inflateStream = createInflateStream();
inflateInit(inflateStream);

inflateStream.next_in = output;
inflateStream.avail_in = deflateStream.total_out;

const result = new Uint8Array(1024);
inflateStream.next_out = result;
inflateStream.avail_out = result.length;

inflate(inflateStream, Z_FINISH);
inflateEnd(inflateStream);
```

# API Reference

## CompressionStream

A Web Streams API TransformStream for compression.

```typescript
new CompressionStream(format?: 'deflate' | 'gzip' | 'deflate-raw', options?: {
  level?: number;     // 0-9, default: 6
  strategy?: number;  // compression strategy
})
```

## DecompressionStream

A Web Streams API TransformStream for decompression.

```typescript
new DecompressionStream(format?: 'inflate' | 'gzip' | 'deflate-raw' | 'deflate64-raw')
```

## Low-level Functions

### Deflate
- `createDeflateStream()` - Create a deflate stream
- `deflateInit(stream, level)` - Initialize deflate stream
- `deflate(stream, flush)` - Compress data
- `deflateEnd(stream)` - Clean up deflate stream

### Inflate
- `createInflateStream(deflate64?)` - Create an inflate stream
- `inflateInit(stream)` - Initialize inflate stream
- `inflate(stream, flush)` - Decompress data
- `inflateEnd(stream)` - Clean up inflate stream

# Compression Levels

- `0`: No compression (stored)
- `1-5`: Fast compression with decreasing speed
- `6`: Default balance of speed/size
- `7-9`: Best compression with decreasing speed

# Supported Formats

- **deflate**: Raw deflate compressed data
- **gzip**: Gzip wrapper with header and CRC
- **deflate-raw**: Deflate without zlib wrapper
- **deflate64-raw**: Extended raw deflate with 64KB window

# Performance

This implementation is optimized for performance with:
- Efficient bit manipulation
- Zero-copy buffer management
- Streaming architecture
- Comprehensive test coverage

# Testing

Run the test suite:

```bash
npm test
```

Run with coverage:

```bash
npm run coverage:c8
```

# Building

```bash
npm run build:min  # Create minified build
```

# License

This project is licensed under the MIT License. See [LICENSE.md](LICENSE.md) for details.

# Acknowledgments

This is a TypeScript port of the original zlib C library by Jean-loup Gailly and Mark Adler.
