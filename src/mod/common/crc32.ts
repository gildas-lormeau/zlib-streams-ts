// Slicing-by-8 CRC-32 (Intel / zlib). The eight 256-entry tables let the inner loop
// consume 8 bytes per iteration with a shorter dependency chain, ~4x the byte-at-a-time
// rate (measured ~290 -> ~1300 MB/s on typical inputs).
//
// Every table MUST stay a PACKED_SMI array: build with array literals (not `new Array(n)`,
// which is HOLEY) and store the signed int32 XOR result (no `>>> 0`). An unsigned or holey
// table becomes a V8 FixedDoubleArray whose every hot-loop lookup unboxes a double (~1.6x
// slower). Signedness is irrelevant to the result — the reads mask/shift it and the final
// `^ 0xffffffff >>> 0` normalizes it. Do NOT reintroduce `>>> 0` or `new Array(256)`.
const T: number[][] = [[], [], [], [], [], [], [], []];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  T[0][n] = c;
}
for (let n = 0; n < 256; n++) {
  for (let k = 1; k < 8; k++) {
    const previous = T[k - 1][n];
    T[k][n] = (previous >>> 8) ^ T[0][previous & 0xff];
  }
}
const [T0, T1, T2, T3, T4, T5, T6, T7] = T;

export function crc32(crc: number = 0, buf?: Uint8Array, len?: number): number {
  if (!buf) {
    return 0;
  }

  if (len === undefined) {
    len = buf.length;
  }

  len = Math.min(len, buf.length);

  let c = ~crc | 0;
  let i = 0;
  // Process 8 bytes per iteration. DataView.getInt32(le) reads an unaligned little-endian
  // word as a signed int32 (no double boxing), so no alignment or endianness handling.
  if (len >= 8) {
    const view = new DataView(buf.buffer, buf.byteOffset, len);
    const end = len - 8;
    for (; i <= end; i += 8) {
      const a = c ^ view.getInt32(i, true);
      const b = view.getInt32(i + 4, true);
      c =
        T7[a & 0xff] ^ T6[(a >>> 8) & 0xff] ^ T5[(a >>> 16) & 0xff] ^ T4[(a >>> 24) & 0xff] ^
        T3[b & 0xff] ^ T2[(b >>> 8) & 0xff] ^ T1[(b >>> 16) & 0xff] ^ T0[(b >>> 24) & 0xff];
    }
  }
  // Remaining tail bytes with the base table.
  for (; i < len; i++) {
    c = (c >>> 8) ^ T0[(c ^ buf[i]) & 0xff];
  }

  return (c ^ 0xffffffff) >>> 0;
}
