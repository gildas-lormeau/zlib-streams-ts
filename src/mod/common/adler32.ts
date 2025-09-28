const BASE = 65521;
const NMAX = 5552;

function mod(a: number): number {
  return a % BASE >>> 0;
}

export function adler32(adler: number, buf?: Uint8Array, len?: number): number {
  if (buf === undefined || len === undefined) {
    return 1 >>> 0;
  }

  let sum2 = (adler >>> 16) & 0xffff;
  adler &= 0xffff;

  if (len == 1) {
    adler += buf[0];
    if (adler >= BASE) {
      adler -= BASE;
    }
    sum2 += adler;
    if (sum2 >= BASE) {
      sum2 -= BASE;
    }
    return ((sum2 << 16) | adler) >>> 0;
  }

  if (len < 16) {
    for (let i = 0; i < len; i++) {
      adler += buf[i];
      sum2 += adler;
    }
    if (adler >= BASE) {
      adler -= BASE;
    }
    sum2 = mod(sum2);
    return ((sum2 << 16) | adler) >>> 0;
  }

  while (len >= NMAX) {
    len -= NMAX;
    let n = Math.floor(NMAX / 16);
    do {
      for (let i = 0; i < 16; i++) {
        adler += buf[i];
        sum2 += adler;
      }
      buf = buf.subarray(16);
    } while (--n);
    adler = mod(adler);
    sum2 = mod(sum2);
  }

  if (len) {
    while (len >= 16) {
      len -= 16;
      for (let i = 0; i < 16; i++) {
        adler += buf[i];
        sum2 += adler;
      }
      buf = buf.subarray(16);
    }
    for (let i = 0; i < len; i++) {
      adler += buf[i];
      sum2 += adler;
    }
    adler = mod(adler);
    sum2 = mod(sum2);
  }

  return ((sum2 << 16) | adler) >>> 0;
}
