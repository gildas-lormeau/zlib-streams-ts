const BASE = 65521;
const BLOCK = 2000;

export function adler32(adler: number, buf?: Uint8Array, len?: number): number {
  if (buf === undefined || len === undefined) {
    return 1 >>> 0;
  }

  let adlerLo = adler & 0xffff;
  let sum2 = (adler >>> 16) & 0xffff;
  let pos = 0;

  while (len > 0) {
    let n = len > BLOCK ? BLOCK : len;
    len -= n;
    do {
      adlerLo = (adlerLo + buf[pos++]) | 0;
      sum2 = (sum2 + adlerLo) | 0;
    } while (--n);
    adlerLo %= BASE;
    sum2 %= BASE;
  }

  return ((sum2 << 16) | adlerLo) >>> 0;
}
