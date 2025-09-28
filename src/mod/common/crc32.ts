const CRC_TABLE: ReadonlyArray<number> = ((): ReadonlyArray<number> => {
  const table = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
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
