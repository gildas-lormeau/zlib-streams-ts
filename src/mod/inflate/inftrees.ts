import type { HuffmanCode } from "../common/types";

import { CodeType } from "../common/types";

import {
  ENOUGH_LENS,
  ENOUGH_DISTS,
  ENOUGH_DISTS_9,
  LBASE,
  LEXT,
  DBASE,
  DEXT,
  LBASE_9,
  LEXT_9,
  DBASE_9,
  DEXT_9,
} from "./constants";
import { createCode, createInvalidCodeMarker, createEndOfBlockCode } from "./utils";

type TableParams = {
  _lbase: Uint16Array;
  _lext: Uint16Array;
  _dbase: Uint16Array;
  _dext: Uint16Array;
  _codeMatch: number;
  _lensMatch: number;
  _distMatch: number;
  _enoughDists: number;
  _enoughInclusive: boolean;
  _createTableWhenNoCodes: boolean;
  _deflate64: boolean;
};

const MAXBITS = 15;

const PARAMS: TableParams = {
  _deflate64: false,
  _lbase: LBASE,
  _lext: LEXT,
  _dbase: DBASE,
  _dext: DEXT,
  _codeMatch: 20,
  _lensMatch: 257,
  _distMatch: 0,
  _enoughDists: ENOUGH_DISTS,
  _enoughInclusive: false,
  _createTableWhenNoCodes: true,
};

const PARAMS_9: TableParams = {
  _deflate64: true,
  _lbase: LBASE_9,
  _lext: LEXT_9,
  _dbase: DBASE_9,
  _dext: DEXT_9,
  _codeMatch: 19,
  _lensMatch: 256,
  _distMatch: -1,
  _enoughDists: ENOUGH_DISTS_9,
  _enoughInclusive: true,
  _createTableWhenNoCodes: false,
};

export function inflate_table(
  type: CodeType,
  lens: Uint16Array,
  codes: number,
  table: { _value: HuffmanCode[] },
  bits: { _value: number },
  work: Uint16Array,
  index: { _value: number },
  deflate64?: boolean,
): number {
  let len: number;
  let sym: number;
  let min: number;
  let max: number;
  let root: number;
  let curr: number;
  let drop: number;
  let left: number;
  let used: number;
  let huff: number;
  let incr: number;
  let fill: number;
  let low: number;
  let mask: number;
  let here: HuffmanCode;
  let next_index: number;
  let base: Uint16Array;
  let extra: Uint16Array;
  let match: number;

  const count = new Uint16Array(MAXBITS + 1);
  const offs = new Uint16Array(MAXBITS + 1);

  const params = deflate64 ? PARAMS_9 : PARAMS;

  for (len = 0; len <= MAXBITS; len++) {
    count[len] = 0;
  }
  for (sym = 0; sym < codes; sym++) {
    count[lens[sym]]++;
  }

  root = bits._value;
  for (max = MAXBITS; max >= 1; max--) {
    if (count[max] != 0) {
      break;
    }
  }
  if (root > max) {
    root = max;
  }
  if (max == 0) {
    if (params._createTableWhenNoCodes) {
      here = createInvalidCodeMarker(1);

      table._value[0] = here;
      table._value[1] = here;
      bits._value = 1;
      return 0;
    }
    return -1;
  }
  for (min = 1; min < max; min++) {
    if (count[min] != 0) {
      break;
    }
  }
  if (root < min) {
    root = min;
  }

  left = 1;
  for (len = 1; len <= MAXBITS; len++) {
    left <<= 1;
    left -= count[len];
    if (left < 0) {
      return -1;
    }
  }
  if (left > 0 && (type == CodeType.CODES || max != 1)) {
    return -1;
  }

  offs[1] = 0;
  for (len = 1; len < MAXBITS; len++) {
    offs[len + 1] = offs[len] + count[len];
  }

  for (sym = 0; sym < codes; sym++) {
    if (lens[sym] != 0) {
      work[offs[lens[sym]]++] = sym;
    }
  }

  switch (type) {
    case CodeType.CODES:
      base = extra = work;
      match = params._codeMatch;
      break;
    case CodeType.LENS:
      base = params._lbase;
      extra = params._lext;
      match = params._lensMatch;
      break;
    default:
      base = params._dbase;
      extra = params._dext;
      match = params._distMatch;
  }

  huff = 0;
  sym = 0;
  len = min;
  next_index = index._value;
  curr = root;
  drop = 0;
  low = -1;
  used = 1 << root;
  mask = used - 1;

  if (
    (type == CodeType.LENS && (params._enoughInclusive ? used >= ENOUGH_LENS : used > ENOUGH_LENS)) ||
    (type == CodeType.DISTS && (params._enoughInclusive ? used >= params._enoughDists : used > params._enoughDists))
  ) {
    return 1;
  }

  for (;;) {
    here = createTableEntry(work, sym, len, drop, type, base, extra, match, params._deflate64);
    incr = 1 << (len - drop);
    fill = 1 << curr;
    min = fill;
    do {
      fill -= incr;
      const slot = (huff >> drop) + fill;
      table._value[next_index + slot] = { ...here };
    } while (fill != 0);

    incr = 1 << (len - 1);
    while (huff & incr) {
      incr >>= 1;
    }
    if (incr != 0) {
      huff &= incr - 1;
      huff += incr;
    } else {
      huff = 0;
    }

    sym++;
    if (--count[len] == 0) {
      if (len == max) {
        break;
      }
      len = lens[work[sym]];
    }

    if (len > root && (huff & mask) != low) {
      if (drop == 0) {
        drop = root;
      }

      next_index += 1 << curr;

      curr = len - drop;
      left = 1 << curr;
      while (curr + drop < max) {
        left -= count[curr + drop];
        if (left <= 0) {
          break;
        }
        curr++;
        left <<= 1;
      }

      used += 1 << curr;
      if (
        (type == CodeType.LENS && (params._enoughInclusive ? used >= ENOUGH_LENS : used > ENOUGH_LENS)) ||
        (type == CodeType.DISTS && (params._enoughInclusive ? used >= params._enoughDists : used > params._enoughDists))
      ) {
        return 1;
      }

      low = huff & mask;
      table._value[index._value + low] = {
        _op: curr,
        _bits: root,
        _val: next_index - index._value,
      };
    }
  }

  if (huff != 0) {
    here = createInvalidCodeMarker(len - drop);
    while (huff != 0) {
      if (drop != 0 && (huff & mask) != low) {
        drop = 0;
        len = root;
        next_index = index._value;
        curr = root;
        here._bits = len;
      }

      table._value[next_index + (huff >> drop)] = { ...here };

      incr = 1 << (len - 1);
      while (huff & incr) {
        incr >>= 1;
      }
      if (incr != 0) {
        huff &= incr - 1;
        huff += incr;
      } else {
        huff = 0;
      }
    }
  }

  index._value += used;
  bits._value = root;
  return 0;
}

function createTableEntry(
  work: Uint16Array,
  sym: number,
  len: number,
  drop: number,
  type: CodeType,
  base: Uint16Array,
  extra: Uint16Array,
  match: number,
  deflate64: boolean,
): HuffmanCode {
  let here: HuffmanCode;
  if (deflate64 ? work[sym] < match : work[sym] + 1 < match) {
    here = createCode(0, len - drop, work[sym]);
  } else if (deflate64 ? work[sym] > match : work[sym] >= match) {
    if (deflate64 && type == CodeType.LENS) {
      const idx = work[sym] - 257;
      here = createCode(extra[idx], len - drop, base[idx]);
    } else {
      const idx = deflate64 ? work[sym] : work[sym] - match;
      here = createCode(extra[idx], len - drop, base[idx]);
    }
  } else {
    here = createEndOfBlockCode(len - drop);
  }
  return here;
}
