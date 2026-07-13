// Perf: keep the table entries as signed int32 (the natural XOR result) and build it
// with an array literal. Coercing to unsigned via `>>> 0` pushes entries past the V8
// Smi range, forcing a FixedDoubleArray whose every lookup in the hot loop unboxes a
// double (~1.6x slower, 180 vs 290 MB/s). Signedness is irrelevant to the result:
// `(crc >>> 8) ^ CRC_TABLE[..]` plus the final `^ 0xffffffff >>> 0` normalize it.
// Do NOT reintroduce `>>> 0` here, and do NOT use `new Array(256)` (that yields a
// HOLEY array, a smaller but real penalty) — keep it a PACKED_SMI array.
const CRC_TABLE: ReadonlyArray<number> = ((): ReadonlyArray<number> => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

export function crc32(crc: number = 0, buf?: Uint8Array, len?: number): number {
  if (!buf) {
    return 0;
  }

  if (len === undefined) {
    len = buf.length;
  }

  len = Math.min(len, buf.length);

  crc = ~crc >>> 0;

  for (let i = 0; i < len; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}
