import type { Stream, InflateStream, InflateState, GzipHeader, HuffmanCode } from "../common/types";

import { adler32 } from "../common/adler32";
import {
  BL_ORDER,
  Z_STREAM_ERROR,
  Z_MEM_ERROR,
  Z_OK,
  Z_BUF_ERROR,
  Z_FINISH,
  Z_DEFLATED,
  Z_NEED_DICT,
  Z_BLOCK,
  Z_TREES,
  Z_STREAM_END,
  Z_DATA_ERROR,
  DEF_WBITS,
  DEFLATE64_WINDOW_BITS,
  GZIP_WRAPPER_OFFSET,
  WINDOW_SIZE,
  DEFLATE64_WINDOW_SIZE,
  WINDOW_BITS,
  EMPTY_UINT8,
} from "../common/constants";
import { crc32 } from "../common/crc32";
import { InflateMode, CodeType } from "../common/types";
import { createStream, zmemcpy } from "../common/utils";

import { inflate_fast } from "./inffast";
import { inflate_table } from "./inftrees";

import { createCode, ZSWAP32, createInflateState } from "./utils";

const fixed: HuffmanCode[] = new Array(544);

let virgin = true;
let lenfix: HuffmanCode[];
let distfix: HuffmanCode[];

export {
  createInflateStream,
  inflateInit,
  inflateInit2_,
  inflateReset2,
  inflateReset,
  inflateResetKeep,
  inflate,
  inflateEnd,
  inflateGetDictionary,
  inflateSetDictionary,
  inflateGetHeader,
  inflateCopy,
  inflatePrime,
  inflateSync,
  inflateSyncPoint,
  inflateUndermine,
  inflateValidate,
  inflateMark,
  inflateCodesUsed,
};

function createInflateStream(deflate64?: boolean): InflateStream {
  const strm: Stream = createStream();
  strm._state = createInflateState(strm as InflateStream, Boolean(deflate64));
  return strm as InflateStream;
}

function inflateInit(strm: InflateStream): number {
  return inflateInit2_(strm, DEF_WBITS);
}

function inflateStateCheck(strm: InflateStream): boolean {
  let state: InflateState;
  if (!strm) {
    return true;
  }
  state = strm._state;
  if (
    !state ||
    state._strm != strm ||
    (state._deflate64 && (state._mode < InflateMode.TYPE || state._mode > InflateMode.BAD)) ||
    (!state._deflate64 && (state._mode < InflateMode.HEAD || state._mode > InflateMode.SYNC))
  ) {
    return true;
  }
  return false;
}

function inflateResetKeep(strm: InflateStream): number {
  let state: InflateState;

  if (inflateStateCheck(strm)) {
    return Z_STREAM_ERROR;
  }
  state = strm._state;
  strm.total_in = strm.total_out = state._total = 0;
  strm.msg = "";
  if (state._wrap) {
    strm._adler = state._wrap & 1;
  }
  state._mode = state._deflate64 ? InflateMode.TYPE : InflateMode.HEAD;
  state._last = false;
  state._havedict = false;
  state._flags = -1;
  state._dmax = state._deflate64 ? DEFLATE64_WINDOW_SIZE : WINDOW_SIZE;
  delete state._gzhead;
  state._bit_buffer = 0;
  state._bit_count = 0;
  state._lencode = state._codes;
  state._distcode = state._codes;
  state._next = state._codes;
  state._sane = true;
  state._back = -1;

  return Z_OK;
}

function inflateReset(strm: InflateStream): number {
  let state: InflateState;

  if (inflateStateCheck(strm)) {
    return Z_STREAM_ERROR;
  }
  state = strm._state;

  state._w_size = 0;
  state._w_have = 0;
  state._w_next = 0;
  return inflateResetKeep(strm);
}

function inflateReset2(strm: InflateStream, windowBits: number): number {
  let wrap: number;
  let state: InflateState;

  if (inflateStateCheck(strm)) {
    return Z_STREAM_ERROR;
  }
  state = strm._state!;
  let maxWindowBits;
  if (state._deflate64) {
    windowBits = -GZIP_WRAPPER_OFFSET;
    maxWindowBits = DEFLATE64_WINDOW_BITS;
  } else {
    maxWindowBits = WINDOW_BITS;
  }

  if (windowBits < 0) {
    if (windowBits < -maxWindowBits) {
      return Z_STREAM_ERROR;
    }
    wrap = 0;
    windowBits = -windowBits;
  } else {
    wrap = (windowBits >> 4) + 5;
    if (!state._deflate64 && windowBits < 48) {
      windowBits &= WINDOW_BITS;
    }
  }

  if (windowBits && (windowBits < 8 || windowBits > maxWindowBits)) {
    return Z_STREAM_ERROR;
  }
  if (state._window.length > 0 && state._w_bits != windowBits) {
    state._window = EMPTY_UINT8;
  }

  state._wrap = wrap;
  state._w_bits = windowBits;
  return inflateReset(strm);
}

function inflateInit2_(strm: InflateStream, windowBits: number): number {
  let ret: number;
  let state: InflateState;

  if (!strm) {
    return Z_STREAM_ERROR;
  }
  strm.msg = "";
  const deflate64 = Boolean(strm._state._deflate64);
  state = createInflateState(strm, deflate64);
  if (deflate64) {
    windowBits = -16;
  }

  strm._state = state;
  state._strm = strm;
  state._mode = state._deflate64 ? InflateMode.TYPE : InflateMode.HEAD;
  ret = inflateReset2(strm, windowBits);
  if (ret != Z_OK) {
  }
  return ret;
}

function inflatePrime(strm: InflateStream, bits: number, value: number): number {
  let state: InflateState;

  if (inflateStateCheck(strm)) {
    return Z_STREAM_ERROR;
  }
  if (bits == 0) {
    return Z_OK;
  }
  state = strm._state;
  if (bits < 0) {
    state._bit_buffer = 0;
    state._bit_count = 0;
    return Z_OK;
  }
  if (bits > 16 || state._bit_count + bits > 32) {
    return Z_STREAM_ERROR;
  }
  value &= (1 << bits) - 1;
  state._bit_buffer += value << state._bit_count;
  state._bit_count += bits;
  return Z_OK;
}

function fixedtables(state: InflateState): void {
  let distIndexRef = { _value: 0 };

  if (virgin) {
    let sym: number, bits: number;
    let next: HuffmanCode[];

    sym = 0;
    while (sym < 144) {
      state._lens[sym++] = 8;
    }
    while (sym < 256) {
      state._lens[sym++] = 9;
    }
    while (sym < 280) {
      state._lens[sym++] = 7;
    }
    while (sym < 288) {
      state._lens[sym++] = 8;
    }
    for (let i = 0; i < 544; i++) {
      fixed[i] = createCode();
    }
    next = fixed;
    lenfix = next;
    bits = 9;
    const nextRef = { _value: next };
    const bitsRef = { _value: bits };
    const nextIndexRef = { _value: 0 };
    inflate_table(CodeType.LENS, state._lens, 288, nextRef, bitsRef, state._work, nextIndexRef, state._deflate64);
    next = nextRef._value;
    bits = bitsRef._value;
    state._next_index = nextIndexRef._value;

    sym = 0;
    while (sym < 32) {
      state._lens[sym++] = 5;
    }
    bits = 5;

    const distBaseIndex = nextIndexRef._value;
    const distNextRef = { _value: next };
    const distBitsRef = { _value: bits };
    distIndexRef._value = distBaseIndex;
    inflate_table(
      CodeType.DISTS,
      state._lens,
      32,
      distNextRef,
      distBitsRef,
      state._work,
      distIndexRef,
      state._deflate64,
    );
    distfix = next.slice(distBaseIndex);

    virgin = false;
  }
  state._lencode = lenfix;
  state._lenbits = 9;
  state._distcode = distfix;
  state._distbits = 5;
  state._next_index = distIndexRef._value;
}

function updatewindow(strm: InflateStream, end: Uint8Array, copy: number): number {
  const state = strm._state;

  if (!state._window || state._window.length == 0) {
    state._window = new Uint8Array(1 << state._w_bits);
    if (!state._window) {
      return 1;
    }
  }

  if (state._w_size == 0) {
    state._w_size = 1 << state._w_bits;
    state._w_next = 0;
    state._w_have = 0;
  }

  if (copy >= state._w_size) {
    zmemcpy(state._window, 0, end, end.length - state._w_size, state._w_size);
    state._w_next = 0;
    state._w_have = state._w_size;
  } else {
    let dist = state._w_size - state._w_next;
    if (dist > copy) {
      dist = copy;
    }
    zmemcpy(state._window, state._w_next, end, end.length - copy, dist);
    copy -= dist;
    if (copy) {
      zmemcpy(state._window, 0, end, end.length - copy, copy);
      state._w_next = copy;
      state._w_have = state._w_size;
    } else {
      state._w_next += dist;
      if (state._w_next == state._w_size) {
        state._w_next = 0;
      }
      if (state._w_have < state._w_size) {
        state._w_have += dist;
      }
    }
  }
  return 0;
}

class NeedMoreInput extends Error {
  constructor() {
    super("Need more input");
  }
}

function inflate(strm: InflateStream, flush: number): number {
  let state: InflateState;
  let next: Uint8Array;
  let next_index: number;
  let put: Uint8Array;
  let put_index: number;
  let have: number, left: number;
  let hold: number;
  let bits: number;
  let in_index: number, out: number;
  let copy: number;
  let from_index: number;
  let here: HuffmanCode;
  let last: HuffmanCode;
  let len: number;
  let ret: number;
  let hbuf = new Uint8Array(4);

  let needMoreInput = false;

  if (inflateStateCheck(strm) || !strm.next_out || (!strm.next_in && strm.avail_in != 0)) {
    return Z_STREAM_ERROR;
  }

  have = 0;
  hold = 0;
  left = 0;
  bits = 0;
  next = EMPTY_UINT8;
  next_index = 0;
  put = EMPTY_UINT8;
  put_index = 0;

  state = strm._state!;
  if (state._mode == InflateMode.TYPE) {
    state._mode = InflateMode.TYPEDO;
  }
  LOAD();
  in_index = have;
  out = left;
  ret = Z_OK;
  try {
    for (;;) {
      switch (state._mode) {
        case InflateMode.HEAD:
          if (state._wrap == 0) {
            state._mode = InflateMode.TYPEDO;
            break;
          }
          NEEDBITS(16);
          if (state._wrap & 2 && hold == 0x8b1f) {
            if (state._w_bits == 0) {
              state._w_bits = 15;
            }
            state._check = crc32(0);
            state._check = CRC2(state._check, hold);
            INITBITS();
            state._mode = InflateMode.FLAGS;
            break;
          }
          if (state._gzhead) {
            state._gzhead._done = -1;
          }
          if (!(state._wrap & 1) || ((BITS(8) << 8) + (hold >> 8)) % 31) {
            strm.msg = "incorrect header check";
            state._mode = InflateMode.BAD;
            break;
          }
          if (BITS(4) != Z_DEFLATED) {
            strm.msg = "unknown compression method";
            state._mode = InflateMode.BAD;
            break;
          }
          DROPBITS(4);
          len = BITS(4) + 8;
          if (state._w_bits == 0) {
            state._w_bits = len;
          }
          if (len > 15 || len > state._w_bits) {
            strm.msg = "invalid window size";
            state._mode = InflateMode.BAD;
            break;
          }
          state._dmax = 1 << len;
          state._flags = 0;

          strm._adler = state._check = adler32(0);
          state._mode = hold & 0x200 ? InflateMode.DICTID : InflateMode.TYPE;
          INITBITS();
          break;
        case InflateMode.FLAGS:
          NEEDBITS(16);
          state._flags = hold;
          if ((state._flags & 0xff) != Z_DEFLATED) {
            strm.msg = "unknown compression method";
            state._mode = InflateMode.BAD;
            break;
          }
          if (state._flags & 0xe000) {
            strm.msg = "unknown header flags set";
            state._mode = InflateMode.BAD;
            break;
          }
          if (state._gzhead) {
            state._gzhead._text = (hold >> 8) & 1;
          }
          if (state._flags & 0x0200 && state._wrap & 4) {
            state._check = CRC2(state._check, hold);
          }
          INITBITS();
          state._mode = InflateMode.TIME;

        case InflateMode.TIME:
          NEEDBITS(32);
          if (state._gzhead) {
            state._gzhead._time = hold;
          }
          if (state._flags & 0x0200 && state._wrap & 4) {
            state._check = CRC4(state._check, hold);
          }
          INITBITS();
          state._mode = InflateMode.OS;

        case InflateMode.OS:
          NEEDBITS(16);
          if (state._gzhead) {
            state._gzhead._xflags = hold & 0xff;
            state._gzhead._os = hold >> 8;
          }
          if (state._flags & 0x0200 && state._wrap & 4) {
            state._check = CRC2(state._check, hold);
          }
          INITBITS();
          state._mode = InflateMode.EXLEN;

        case InflateMode.EXLEN:
          if (state._flags & 0x0400) {
            NEEDBITS(16);
            state._length = hold;
            if (state._gzhead) {
              state._gzhead._extra_len = hold;
            }
            if (state._flags & 0x0200 && state._wrap & 4) {
              state._check = CRC2(state._check, hold);
            }
            INITBITS();
          } else if (state._gzhead) {
            state._gzhead._extra = EMPTY_UINT8;
          }
          state._mode = InflateMode.EXTRA;

        case InflateMode.EXTRA:
          if (state._flags & 0x0400) {
            copy = state._length;
            if (copy > have) {
              copy = have;
            }
            if (copy) {
              if (
                state._gzhead &&
                state._gzhead._extra &&
                state._gzhead._extra_max &&
                (len = state._gzhead._extra_len - state._length) < state._gzhead._extra_max
              ) {
                zmemcpy(state._gzhead._extra, len, next, next_index, copy);
              }
              if (state._flags & 0x0200 && state._wrap & 4) {
                state._check = crc32(state._check, next.subarray(next_index, next_index + copy), copy);
              }
              have -= copy;
              next_index += copy;
              state._length -= copy;
            }
            if (state._length) {
              return inf_leave();
            }
          }
          state._length = 0;
          state._mode = InflateMode.NAME;

        case InflateMode.NAME:
          if (state._flags & 0x0800) {
            if (have == 0) {
              return inf_leave();
            }
            copy = 0;
            do {
              len = next[next_index + copy++];
              if (state._gzhead && state._gzhead._name_max && state._length < state._gzhead._name_max) {
                state._gzhead._name[state._length++] = len;
              }
            } while (len && copy < have);
            if (state._flags & 0x0200 && state._wrap & 4) {
              state._check = crc32(state._check, next.subarray(next_index, next_index + copy), copy);
            }
            have -= copy;
            next_index += copy;
            if (len) {
              return inf_leave();
            }
          } else if (state._gzhead) {
            state._gzhead._name = EMPTY_UINT8;
          }
          state._length = 0;
          state._mode = InflateMode.COMMENT;

        case InflateMode.COMMENT:
          if (state._flags & 0x1000) {
            if (have == 0) {
              return inf_leave();
            }
            copy = 0;
            do {
              len = next[next_index + copy++];
              if (state._gzhead && state._gzhead._comm_max && state._length < state._gzhead._comm_max) {
                state._gzhead._comment[state._length++] = len;
              }
            } while (len && copy < have);
            if (state._flags & 0x0200 && state._wrap & 4) {
              state._check = crc32(state._check, next.subarray(next_index, next_index + copy), copy);
            }
            have -= copy;
            next_index += copy;
            if (len) {
              return inf_leave();
            }
          } else if (state._gzhead) {
            state._gzhead._comment = EMPTY_UINT8;
          }
          state._mode = InflateMode.HCRC;

        case InflateMode.HCRC:
          if (state._flags & 0x0200) {
            NEEDBITS(16);
            if (state._wrap & 4 && hold != (state._check & 0xffff)) {
              strm.msg = "header crc mismatch";
              state._mode = InflateMode.BAD;
              break;
            }
            INITBITS();
          }
          if (state._gzhead) {
            state._gzhead._hcrc = (state._flags >> 9) & 1;
            state._gzhead._done = 1;
          }
          strm._adler = state._check = crc32(0);
          state._mode = InflateMode.TYPE;
          break;
        case InflateMode.DICTID:
          NEEDBITS(32);
          strm._adler = state._check = ZSWAP32(hold);
          INITBITS();
          state._mode = InflateMode.DICT;

        case InflateMode.DICT:
          if (!state._havedict) {
            RESTORE();
            return Z_NEED_DICT;
          }
          strm._adler = state._check = adler32(0);
          state._mode = InflateMode.TYPE;

        case InflateMode.TYPE:
          if (flush == Z_BLOCK || flush == Z_TREES) {
            return inf_leave();
          }

        case InflateMode.TYPEDO:
          if (state._last) {
            BYTEBITS();
            state._mode = InflateMode.CHECK;
            break;
          }
          NEEDBITS(3);
          state._last = Boolean(BITS(1));
          DROPBITS(1);
          switch (BITS(2)) {
            case 0:
              state._mode = InflateMode.STORED;
              break;
            case 1:
              fixedtables(state);

              state._mode = InflateMode.LEN_;
              if (flush == Z_TREES) {
                DROPBITS(2);
                return inf_leave();
              }
              break;
            case 2:
              state._mode = InflateMode.TABLE;
              break;
            case 3:
              strm.msg = "invalid block type";
              state._mode = InflateMode.BAD;
          }
          DROPBITS(2);
          break;
        case InflateMode.STORED:
          BYTEBITS();
          NEEDBITS(32);
          if ((hold & 0xffff) != ((hold >>> 16) ^ 0xffff)) {
            strm.msg = "invalid stored block lengths";
            state._mode = InflateMode.BAD;
            break;
          }
          state._length = hold & 0xffff;

          INITBITS();
          state._mode = InflateMode.COPY_;
          if (flush == Z_TREES) {
            return inf_leave();
          }

        case InflateMode.COPY_:
          state._mode = InflateMode.COPY;

        case InflateMode.COPY:
          copy = state._length;
          if (copy) {
            if (copy > have) {
              copy = have;
            }
            if (copy > left) {
              copy = left;
            }
            if (copy == 0) {
              return inf_leave();
            }
            zmemcpy(put, put_index, next, next_index, copy);
            have -= copy;
            next_index += copy;
            left -= copy;
            put_index += copy;
            state._length -= copy;
            break;
          }

          state._mode = InflateMode.TYPE;
          break;
        case InflateMode.TABLE:
          NEEDBITS(14);
          state._nlen = BITS(5) + 257;
          DROPBITS(5);
          state._ndist = BITS(5) + 1;
          DROPBITS(5);
          state._ncode = BITS(4) + 4;
          DROPBITS(4);
          if (state._nlen > 286 || (!state._deflate64 && state._ndist > 30)) {
            strm.msg = state._deflate64 ? "too many length" : "too many length or distance symbols";
            state._mode = InflateMode.BAD;
            break;
          }

          state._have = 0;
          state._mode = InflateMode.LENLENS;

        case InflateMode.LENLENS:
          while (state._have < state._ncode) {
            NEEDBITS(3);
            state._lens[BL_ORDER[state._have++]] = BITS(3);
            DROPBITS(3);
          }
          while (state._have < 19) {
            state._lens[BL_ORDER[state._have++]] = 0;
          }
          state._next = state._codes;
          state._lencode = state._distcode = state._next;
          state._lenbits = 7;
          const tableRef = { _value: state._next };
          const bitsRef = { _value: state._lenbits };
          const tableIndexRef = { _value: 0 };
          ret = inflate_table(
            CodeType.CODES,
            state._lens,
            19,
            tableRef,
            bitsRef,
            state._work,
            tableIndexRef,
            state._deflate64,
          );
          state._next = tableRef._value;
          state._lenbits = bitsRef._value;
          if (ret) {
            strm.msg = "invalid code lengths set";
            state._mode = InflateMode.BAD;
            break;
          }

          state._have = 0;
          state._mode = InflateMode.CODELENS;

        case InflateMode.CODELENS:
          while (state._have < state._nlen + state._ndist) {
            for (;;) {
              here = state._lencode[BITS(state._lenbits)];
              if (here._bits <= bits) {
                break;
              }
              PULLBYTE();
            }
            if (here._val < 16) {
              DROPBITS(here._bits);
              state._lens[state._have++] = here._val;
            } else {
              if (here._val == 16) {
                NEEDBITS(here._bits + 2);
                DROPBITS(here._bits);
                if (state._have == 0) {
                  strm.msg = "invalid bit length repeat";
                  state._mode = InflateMode.BAD;
                  break;
                }
                len = state._lens[state._have - 1];
                copy = 3 + BITS(2);
                DROPBITS(2);
              } else if (here._val == 17) {
                NEEDBITS(here._bits + 3);
                DROPBITS(here._bits);
                len = 0;
                copy = 3 + BITS(3);
                DROPBITS(3);
              } else {
                NEEDBITS(here._bits + 7);
                DROPBITS(here._bits);
                len = 0;
                copy = 11 + BITS(7);
                DROPBITS(7);
              }
              if (state._have + copy > state._nlen + state._ndist) {
                strm.msg = "invalid bit length repeat";
                state._mode = InflateMode.BAD;
                break;
              }
              while (copy--) {
                state._lens[state._have++] = len;
              }
            }
          }

          if (state._mode == InflateMode.BAD) {
            break;
          }

          if (state._lens[256] == 0) {
            strm.msg = "invalid code -- missing end-of-block";
            state._mode = InflateMode.BAD;
            break;
          }

          state._next = state._codes;
          state._lenbits = 9;
          const lenTableRef = { _value: state._next };
          const lenBitsRef = { _value: state._lenbits };
          const lenIndexRef = { _value: 0 };
          ret = inflate_table(
            CodeType.LENS,
            state._lens,
            state._nlen,
            lenTableRef,
            lenBitsRef,
            state._work,
            lenIndexRef,
            state._deflate64,
          );
          state._next = lenTableRef._value;
          state._lenbits = lenBitsRef._value;
          const lenTableNext = lenIndexRef._value;
          state._lencode = state._next.slice(0, lenTableNext);
          if (ret) {
            strm.msg = "invalid literal/lengths set";
            state._mode = InflateMode.BAD;
            break;
          }
          state._distbits = 6;
          const distLens = state._lens.subarray(state._nlen, state._nlen + state._ndist);
          const distTableRef = { _value: state._next };
          const distBitsRef = { _value: state._distbits };
          const distIndexRef = { _value: lenTableNext };
          ret = inflate_table(
            CodeType.DISTS,
            distLens,
            state._ndist,
            distTableRef,
            distBitsRef,
            state._work,
            distIndexRef,
            state._deflate64,
          );
          state._next = distTableRef._value;
          state._distbits = distBitsRef._value;
          state._distcode = state._next.slice(lenTableNext);
          if (ret) {
            strm.msg = "invalid distances set";
            state._mode = InflateMode.BAD;
            break;
          }

          state._mode = InflateMode.LEN_;
          if (flush == Z_TREES) {
            return inf_leave();
          }

        case InflateMode.LEN_:
          state._mode = InflateMode.LEN;

        case InflateMode.LEN:
          if (!state._deflate64 && have >= 6 && left >= 258) {
            RESTORE();
            inflate_fast(strm, out);
            LOAD();

            if ((state._mode as unknown) == InflateMode.TYPE) {
              state._back = -1;
            }
            break;
          }
          state._back = 0;
          for (;;) {
            here = state._lencode[BITS(state._lenbits)];
            if (here._bits <= bits) {
              break;
            }
            PULLBYTE();
          }
          if (here._op && (here._op & 0xf0) == 0) {
            last = here;
            for (;;) {
              here = state._lencode[last._val + (BITS(last._bits + last._op) >> last._bits)];
              if (last._bits + here._bits <= bits) {
                break;
              }
              PULLBYTE();
            }
            DROPBITS(last._bits);
            state._back += last._bits;
          }
          DROPBITS(here._bits);
          state._back += here._bits;
          state._length = here._val;
          if (here._op == 0) {
            state._mode = InflateMode.LIT;
            break;
          }
          if (here._op & 32) {
            state._back = -1;
            state._mode = InflateMode.TYPE;
            break;
          }
          if (here._op & 64) {
            strm.msg = "invalid literal/length code";
            state._mode = InflateMode.BAD;
            break;
          }
          state._extra = here._op & 15;
          state._mode = InflateMode.LENEXT;

        case InflateMode.LENEXT:
          if (state._extra) {
            NEEDBITS(state._extra);
            state._length += BITS(state._extra);
            DROPBITS(state._extra);
            state._back += state._extra;
          }

          state._was = state._length;
          state._mode = InflateMode.DIST;

        case InflateMode.DIST:
          for (;;) {
            here = state._distcode[BITS(state._distbits)];
            if (here._bits <= bits) {
              break;
            }
            PULLBYTE();
          }
          if ((here._op & 0xf0) == 0) {
            last = here;
            for (;;) {
              here = state._distcode[last._val + (BITS(last._bits + last._op) >> last._bits)];
              if (last._bits + here._bits <= bits) {
                break;
              }
              PULLBYTE();
            }
            DROPBITS(last._bits);
            state._back += last._bits;
          }
          DROPBITS(here._bits);
          state._back += here._bits;
          if (here._op & 64) {
            strm.msg = "invalid distance code";
            state._mode = InflateMode.BAD;
            break;
          }
          state._offset = here._val;
          state._extra = here._op & 15;
          state._mode = InflateMode.DISTEXT;

        case InflateMode.DISTEXT:
          if (state._extra) {
            NEEDBITS(state._extra);
            state._offset += BITS(state._extra);
            DROPBITS(state._extra);
            state._back += state._extra;
          }

          state._mode = InflateMode.MATCH;

        case InflateMode.MATCH:
          if (left == 0) {
            return inf_leave();
          }
          copy = out - left;
          if (state._offset > copy) {
            copy = state._offset - copy;
            if (copy > state._w_have) {
              if (state._sane) {
                strm.msg = "invalid distance too far back";
                state._mode = InflateMode.BAD;
                break;
              }
            }
            if (copy > state._w_next) {
              copy -= state._w_next;
              from_index = state._w_size - copy;
            } else {
              from_index = state._w_next - copy;
            }
            if (copy > state._length) {
              copy = state._length;
            }
            if (copy > left) {
              copy = left;
            }
            for (let i = 0; i < copy; ++i) {
              put[put_index] = state._window[from_index] & 0xff;
              ++put_index;
              ++from_index;
            }
          } else {
            from_index = put_index - state._offset;
            copy = state._length;
            if (copy > left) {
              copy = left;
            }
            for (let i = 0; i < copy; ++i) {
              put[put_index] = put[from_index];
              ++put_index;
              ++from_index;
            }
          }
          if (copy > left) {
            copy = left;
          }
          left -= copy;
          state._length -= copy;
          if (state._length == 0) {
            state._mode = InflateMode.LEN;
          }
          break;
        case InflateMode.LIT:
          if (left == 0) {
            return inf_leave();
          }
          put[put_index++] = state._length;
          left--;
          state._mode = InflateMode.LEN;
          break;
        case InflateMode.CHECK:
          if (state._wrap) {
            NEEDBITS(32);
            out -= left;
            strm.total_out += out;
            state._total += out;
            if (state._wrap & 4 && out) {
              const checkBuf = put.subarray(put_index - out, put_index);
              strm._adler = state._check = UPDATE_CHECK(state._check, checkBuf, out);
            }
            out = left;
            if (state._wrap & 4 && (state._flags ? hold : ZSWAP32(hold) >>> 0) != state._check) {
              strm.msg = "incorrect data check";
              state._mode = InflateMode.BAD;
              break;
            }
            INITBITS();
          }
          state._mode = InflateMode.LENGTH;

        case InflateMode.LENGTH:
          if (state._wrap && state._flags) {
            NEEDBITS(32);
            if (state._wrap & 4 && hold != (state._total & 0xffffffff)) {
              strm.msg = "incorrect length check";
              state._mode = InflateMode.BAD;
              break;
            }
            INITBITS();
          }
          state._mode = InflateMode.DONE;

        case InflateMode.DONE:
          ret = Z_STREAM_END;
          return inf_leave();
        case InflateMode.BAD:
          ret = Z_DATA_ERROR;
          return inf_leave();
        case InflateMode.MEM:
          return Z_MEM_ERROR;
        case InflateMode.SYNC:

        default:
          return Z_STREAM_ERROR;
      }
    }
  } catch (error) {
    if (error instanceof NeedMoreInput) {
      return inf_leave();
    }
    throw error;
  }

  function inf_leave(): number {
    RESTORE();
    if (
      state._w_size ||
      (out != strm.avail_out &&
        state._mode < InflateMode.BAD &&
        (state._deflate64 ? state._mode < InflateMode.DONE : state._mode < InflateMode.CHECK)) ||
      flush != Z_FINISH
    ) {
      const written = out - strm.avail_out;
      if (updatewindow(strm, strm.next_out.subarray(strm.next_out_index - written, strm.next_out_index), written)) {
        state._mode = InflateMode.MEM;
        return Z_MEM_ERROR;
      }
    }
    in_index -= strm.avail_in;
    out -= strm.avail_out;
    strm.total_in += in_index;
    strm.total_out += out;
    state._total += out;
    if (state._wrap & 4 && out) {
      strm._adler = state._check = UPDATE_CHECK(
        state._check,
        strm.next_out.subarray(strm.next_out_index - out, strm.next_out_index),
        out,
      );
    }
    strm._data_type =
      state._bit_count +
      (state._last ? 64 : 0) +
      (state._mode == InflateMode.TYPE ? 128 : 0) +
      (state._mode == InflateMode.LEN_ || state._mode == InflateMode.COPY_ ? 256 : 0);

    if (
      (in_index == 0 && out == 0 && ret == Z_OK) ||
      (needMoreInput && ret == Z_OK) ||
      (flush == Z_FINISH && ret == Z_OK)
    ) {
      ret = Z_BUF_ERROR;
    }
    return ret;
  }

  function UPDATE_CHECK(check: number, buf: Uint8Array, len: number): number {
    return state._flags ? crc32(check, buf, len) : adler32(check, buf, len);
  }

  function CRC2(check: number, word: number): number {
    hbuf[0] = word & 0xff;
    hbuf[1] = (word >>> 8) & 0xff;
    return crc32(check, hbuf, 2) >>> 0;
  }

  function CRC4(check: number, word: number): number {
    hbuf[0] = word & 0xff;
    hbuf[1] = (word >>> 8) & 0xff;
    hbuf[2] = (word >>> 16) & 0xff;
    hbuf[3] = (word >>> 24) & 0xff;
    return crc32(check, hbuf, 4) >>> 0;
  }

  function LOAD(): void {
    put = strm.next_out;
    put_index = strm.next_out_index;
    left = strm.avail_out;
    next = strm.next_in;
    next_index = strm.next_in_index;
    have = strm.avail_in;
    hold = state._bit_buffer;
    bits = state._bit_count;
  }

  function RESTORE(): void {
    strm.next_out = put;
    strm.next_out_index = put_index;
    strm.avail_out = left;
    strm.next_in = next;
    strm.next_in_index = next_index;
    strm.avail_in = have;
    state._bit_buffer = hold;
    state._bit_count = bits;
  }

  function INITBITS(): void {
    hold = 0;
    bits = 0;
  }

  function PULLBYTE(): void {
    do {
      if (have == 0) {
        throw new NeedMoreInput();
      }
      have--;
      hold += (next[next_index] & 0xff) << bits;
      next_index++;
      hold >>>= 0;
      bits += 8;
    } while (0);
  }

  function NEEDBITS(n: number): void {
    do {
      while (bits < n) {
        PULLBYTE();
      }
    } while (0);
  }

  function BITS(n: number): number {
    return hold & ((1 << n) - 1);
  }

  function DROPBITS(n: number): void {
    do {
      hold >>>= n;
      bits -= n;
    } while (0);
  }

  function BYTEBITS(): void {
    do {
      hold >>>= bits & 7;
      bits -= bits & 7;
    } while (0);
  }
}

function inflateEnd(strm: InflateStream): number {
  if (inflateStateCheck(strm)) {
    return Z_STREAM_ERROR;
  }

  return Z_OK;
}

function inflateGetDictionary(
  strm: InflateStream,
  dictionary: Uint8Array | null,
  dictLength: { _value: number } | null,
): number {
  let state: InflateState;

  if (inflateStateCheck(strm)) {
    return Z_STREAM_ERROR;
  }
  state = strm._state;

  if (state._w_have && dictionary) {
    const firstPart = state._w_have - state._w_next;
    zmemcpy(dictionary, 0, state._window, state._w_next, firstPart);

    zmemcpy(dictionary, firstPart, state._window, 0, state._w_next);
  }

  if (dictLength) {
    dictLength._value = state._w_have;
  }
  return Z_OK;
}

function inflateSetDictionary(strm: InflateStream, dictionary: Uint8Array, dictLength: number): number {
  let state: InflateState;
  let dictid: number;
  let ret: number;

  if (inflateStateCheck(strm)) {
    return Z_STREAM_ERROR;
  }
  state = strm._state;
  if (state._wrap != 0 && state._mode != InflateMode.DICT) {
    return Z_STREAM_ERROR;
  }

  if (state._mode == InflateMode.DICT) {
    dictid = adler32(0);
    dictid = adler32(dictid, dictionary, dictLength);
    if (dictid != state._check) {
      return Z_DATA_ERROR;
    }
  }

  ret = updatewindow(strm, dictionary, dictLength);
  if (ret) {
    state._mode = InflateMode.MEM;
    return Z_MEM_ERROR;
  }
  state._havedict = true;

  return Z_OK;
}

function inflateGetHeader(strm: InflateStream, head: GzipHeader): number {
  let state: InflateState;

  if (inflateStateCheck(strm)) {
    return Z_STREAM_ERROR;
  }
  state = strm._state!;
  if ((state._wrap & 2) == 0) {
    return Z_STREAM_ERROR;
  }

  state._gzhead = head;
  head._done = 0;
  return Z_OK;
}

function syncsearch(have: number, buf: Uint8Array, len: number): number {
  let got = have;
  let next = 0;

  while (next < len && got < 4) {
    if (buf[next] == (got < 2 ? 0 : 0xff)) {
      got++;
    } else if (buf[next]) {
      got = 0;
    } else {
      got = 4 - got;
    }
    next++;
  }
  have = got;
  return next;
}

function inflateSync(strm: InflateStream): number {
  let len: number;
  let flags: number;
  let total_in: number;
  let total_out: number;
  let buf: Uint8Array = new Uint8Array(4);
  let state: InflateState;

  if (inflateStateCheck(strm)) {
    return Z_STREAM_ERROR;
  }
  state = strm._state;
  if (strm.avail_in == 0 && state._bit_count < 8) {
    return Z_BUF_ERROR;
  }

  if (state._mode != InflateMode.SYNC) {
    state._mode = InflateMode.SYNC;
    state._bit_buffer >>= state._bit_count & 7;
    state._bit_count -= state._bit_count & 7;
    len = 0;
    while (state._bit_count >= 8) {
      buf[len++] = state._bit_buffer;
      state._bit_buffer >>= 8;
      state._bit_count -= 8;
    }
    state._have = 0;
    syncsearch(state._have, buf, len);
  }

  len = syncsearch(state._have, strm.next_in, strm.avail_in);
  strm.avail_in -= len;
  strm.next_in_index += len;
  strm.total_in += len;

  if (state._have != 4) {
    return Z_DATA_ERROR;
  }
  if (state._flags == -1) {
    state._wrap = 0;
  } else {
    state._wrap &= ~4;
  }
  flags = state._flags;
  total_in = strm.total_in;
  total_out = strm.total_out;
  inflateReset(strm);
  strm.total_in = total_in;
  strm.total_out = total_out;
  state._flags = flags;
  state._mode = InflateMode.TYPE;
  return Z_OK;
}

function inflateSyncPoint(strm: InflateStream): number {
  let state: InflateState;

  if (inflateStateCheck(strm)) {
    return Z_STREAM_ERROR;
  }
  state = strm._state;
  return state._mode == InflateMode.STORED && state._bit_count == 0 ? 1 : 0;
}

function inflateCopy(dest: InflateStream, source: InflateStream): number {
  let state: InflateState;

  if (inflateStateCheck(source) || !dest) {
    return Z_STREAM_ERROR;
  }
  state = source._state;

  Object.assign(dest, source);

  const newWindow = state._window && state._window.length ? new Uint8Array(state._window.length) : EMPTY_UINT8;
  const newLens = new Uint16Array(state._lens.length);
  const newWork = new Uint16Array(state._work.length);
  const newCodes = state._codes ? state._codes.slice() : [];
  const newNext = state._next ? state._next.slice() : [];
  const newLencode = state._lencode ? state._lencode.slice() : [];
  const newDistcode = state._distcode ? state._distcode.slice() : [];

  const ds: InflateState = Object.assign({}, state, {
    _strm: dest,
    _window: newWindow,
    _lens: newLens,
    _work: newWork,
    _codes: newCodes,
    _next: newNext,
    _lencode: newLencode,
    _distcode: newDistcode,
  });

  if (!ds || !ds._lens || !ds._work || !ds._codes) {
    dest._state = undefined as any;
    return Z_MEM_ERROR;
  }

  ds._next_index = state._next_index;

  if (state._window && state._window.length) {
    zmemcpy(ds._window, 0, state._window, 0, state._window.length);
  }
  zmemcpy(ds._lens, 0, state._lens, 0, state._lens.length);
  zmemcpy(ds._work, 0, state._work, 0, state._work.length);

  if (state._codes && state._codes.length) {
    for (let i = 0; i < state._codes.length; ++i) {
      newCodes[i] = { _op: state._codes[i]._op, _bits: state._codes[i]._bits, _val: state._codes[i]._val };
    }

    function findSubsequenceIndex(arr: HuffmanCode[], seq: HuffmanCode[]): number {
      if (!seq || seq.length == 0) {
        return -1;
      }
      for (let i = 0; i <= arr.length - seq.length; i++) {
        let ok = true;
        for (let j = 0; j < seq.length; j++) {
          const a = arr[i + j];
          const s = seq[j];
          if (a._op != s._op || a._bits != s._bits || a._val != s._val) {
            ok = false;
            break;
          }
        }
        if (ok) {
          return i;
        }
      }
      return -1;
    }

    if (state._lencode && state._lencode.length) {
      const idx = findSubsequenceIndex(state._codes, state._lencode);
      if (idx != -1) {
        ds._lencode = newCodes.slice(idx, idx + state._lencode.length);
      }
    }

    if (state._distcode && state._distcode.length) {
      const idx = findSubsequenceIndex(state._codes, state._distcode);
      if (idx != -1) {
        ds._distcode = newCodes.slice(idx, idx + state._distcode.length);
      }
    }

    if (typeof state._next_index == "number" && state._next_index >= 0 && state._next_index < newCodes.length) {
      ds._next = newCodes.slice(state._next_index);
    } else if (state._next && state._next.length) {
      const idx = findSubsequenceIndex(state._codes, state._next);
      if (idx != -1) {
        ds._next = newCodes.slice(idx);
      }
    }
  }

  dest._state = ds;
  return Z_OK;
}

function inflateUndermine(strm: InflateStream, subvert: number): number {
  let state: InflateState;

  if (inflateStateCheck(strm)) {
    return Z_STREAM_ERROR;
  }
  state = strm._state;
  state._sane = !subvert;
  return Z_OK;
}

function inflateValidate(strm: InflateStream, check: number): number {
  let state: InflateState;

  if (inflateStateCheck(strm)) {
    return Z_STREAM_ERROR;
  }
  state = strm._state;
  if (check && state._wrap) {
    state._wrap |= 4;
  } else {
    state._wrap &= ~4;
  }
  return Z_OK;
}

function inflateMark(strm: InflateStream): number {
  let state: InflateState;

  if (inflateStateCheck(strm)) {
    return -(1 << 16);
  }
  state = strm._state;
  return (
    (state._back << 16) +
    (state._mode == InflateMode.COPY
      ? state._length
      : state._mode == InflateMode.MATCH
        ? state._was - state._length
        : 0)
  );
}

function inflateCodesUsed(strm: InflateStream): number {
  let state: InflateState;
  if (inflateStateCheck(strm)) {
    return -1;
  }
  state = strm._state;

  return state._next_index;
}
