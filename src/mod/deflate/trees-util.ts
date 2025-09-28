import { bitReverse } from "./utils";

export function getStaticLiteralLengths(): ReadonlyArray<number> {
  const lengths = new Array(288).fill(0);
  for (let i = 0; i <= 143; i++) {
    lengths[i] = 8;
  }
  for (let i = 144; i <= 255; i++) {
    lengths[i] = 9;
  }
  for (let i = 256; i <= 279; i++) {
    lengths[i] = 7;
  }
  for (let i = 280; i <= 287; i++) {
    lengths[i] = 8;
  }
  return lengths;
}

export function packCanonicalTreeData(lengths: ReadonlyArray<number>): Int32Array {
  const { code, length } = generateCanonicalCodes(lengths);
  const out: number[] = new Array(lengths.length * 2);
  let idx = 0;
  for (let i = 0; i < lengths.length; i++) {
    const len = length[i] || 0;
    const c = code[i] || 0;
    out[idx++] = len ? bitReverse(c, len) : 0;
    out[idx++] = len;
  }
  return new Int32Array(out);
}

export function buildLengthCodeLookup(
  base: Int32Array,
  extraBits: ReadonlyArray<number>,
  maxMatch: number,
): Uint8Array {
  let maxLen = 0;
  for (let j = 0; j < base.length; j++) {
    const span = extraBits[j] ? 1 << extraBits[j] : 1;
    const end = base[j] + span - 1;
    if (end > maxLen) {
      maxLen = end;
    }
  }
  if (maxLen < maxMatch) {
    maxLen = maxMatch;
  }
  const out = new Uint8Array(maxLen + 1);
  for (let i = 0; i <= maxLen; i++) {
    for (let j = 0; j < base.length; j++) {
      const span = extraBits[j] ? 1 << extraBits[j] : 1;
      const start = base[j];
      const end = start + span - 1;
      if (i >= start && i <= end) {
        out[i] = j;
        break;
      }
    }
  }
  return out;
}

export function buildFullDistanceLookup(base: Int32Array, extraBits: ReadonlyArray<number>): Uint8Array {
  let maxDist = 0;
  for (let j = 0; j < base.length; j++) {
    const span = extraBits[j] ? 1 << extraBits[j] : 1;
    const end = base[j] + span - 1;
    if (end > maxDist) {
      maxDist = end;
    }
  }
  const full = new Uint8Array(maxDist + 1);
  for (let i = 0; i <= maxDist; i++) {
    for (let j = 0; j < base.length; j++) {
      const span = extraBits[j] ? 1 << extraBits[j] : 1;
      const start = base[j];
      const end = start + span - 1;
      if (i >= start && i <= end) {
        full[i] = j;
        break;
      }
    }
  }
  return full;
}

export function buildCompactDistLookup512(full: Uint8Array): Uint8Array {
  const compact = new Uint8Array(512);
  const maxDist = full.length - 1;
  for (let d = 0; d < 256; d++) {
    compact[d] = d <= maxDist ? full[d] : full[maxDist];
  }
  for (let d = 256; d <= maxDist; d++) {
    const bucket = d >> 7;
    const idx = 256 + (bucket > 255 ? 255 : bucket);
    compact[idx] = full[d];
  }
  for (let i = 257; i < 512; i++) {
    if (compact[i] == 0) {
      compact[i] = compact[i - 1];
    }
  }
  return compact;
}

function generateCanonicalCodes(lengths: ReadonlyArray<number>): {
  code: ReadonlyArray<number>;
  length: ReadonlyArray<number>;
} {
  const maxBits = Math.max(...lengths);
  const count = new Array(maxBits + 1).fill(0);
  for (const l of lengths) {
    if (l > 0) {
      count[l]++;
    }
  }
  const code = new Array(lengths.length).fill(0);
  const nextCode = new Array(maxBits + 1).fill(0);
  let codeValue = 0;
  for (let bits = 1; bits <= maxBits; bits++) {
    codeValue = (codeValue + count[bits - 1]) << 1;
    nextCode[bits] = codeValue;
  }
  for (let n = 0; n < lengths.length; n++) {
    const len = lengths[n];
    if (len != 0) {
      code[n] = nextCode[len]++;
    }
  }
  return { code, length: lengths };
}
