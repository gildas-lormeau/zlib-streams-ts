import type { Stream, DeflateStream, GzipHeader } from "../common/types";
import type { CompressFunction } from "./types";

import { adler32 } from "../common/adler32";
import { crc32 } from "../common/crc32";
import { DeflateState, DeflateStatus } from "../common/types";
import { createStream, zmemcpy, zmemzero } from "../common/utils";

import { _tr_align, _tr_init, _tr_flush_bits, _tr_stored_block, _tr_flush_block } from "./trees";
import { BlockState, InflatePos } from "./types";
import { MAX_DIST, ERR_MSG, ERR_RETURN, createDeflateState, put_byte, _tr_tally_dist, _tr_tally_lit } from "./utils";

import {
  Z_DEFLATED,
  Z_DEFAULT_STRATEGY,
  Z_STREAM_ERROR,
  Z_DEFAULT_COMPRESSION,
  Z_FIXED,
  Z_MEM_ERROR,
  Z_OK,
  Z_UNKNOWN,
  Z_BUF_ERROR,
  Z_BLOCK,
  Z_FINISH,
  Z_HUFFMAN_ONLY,
  Z_NO_FLUSH,
  Z_RLE,
  Z_PARTIAL_FLUSH,
  Z_FULL_FLUSH,
  Z_STREAM_END,
  Z_DATA_ERROR,
  Z_FILTERED,
  DEF_WBITS,
  WINDOW_BITS,
  GZIP_WRAPPER_OFFSET,
  EMPTY_UINT8,
  EMPTY_UINT16,
} from "../common/constants";

import {
  MAX_MEM_LEVEL,
  DEF_MEM_LEVEL,
  MIN_MATCH,
  MAX_MATCH,
  MIN_LOOKAHEAD,
  LIT_BUFS,
  BI_BUF_SIZE,
  WIN_INIT,
  OS_CODE,
  PRESET_DICT,
  LAST_FLUSH,
} from "./constants";

export {
  createDeflateStream,
  deflateInit,
  deflateInit2_,
  deflateInit2,
  deflateReset,
  deflateResetKeep,
  deflateSetHeader,
  deflate,
  deflateEnd,
  deflateSetDictionary,
  deflateGetDictionary,
  deflatePending,
  deflateUsed,
  deflatePrime,
  deflateParams,
  deflateTune,
  deflateStateCheck,
  deflateCopy,
  deflateBound,
  deflate_stored,
  deflate_fast,
  deflate_slow,
};

function createDeflateStream(): DeflateStream {
  const strm: Stream = createStream();
  strm._state = createDeflateState(strm as DeflateStream);
  return strm as DeflateStream;
}

const CONFIGURATION_TABLE: ReadonlyArray<{
  _func: CompressFunction;
  _max_lazy: number;
  _good_length: number;
  _nice_length: number;
  _max_chain: number;
}> = [
  { _func: deflate_stored, _max_lazy: 0, _good_length: 0, _nice_length: 0, _max_chain: 0 },
  { _func: deflate_fast, _max_lazy: 4, _good_length: 4, _nice_length: 8, _max_chain: 4 },
  { _func: deflate_fast, _max_lazy: 5, _good_length: 5, _nice_length: 16, _max_chain: 8 },
  { _func: deflate_fast, _max_lazy: 6, _good_length: 16, _nice_length: 32, _max_chain: 32 },
  { _func: deflate_slow, _max_lazy: 4, _good_length: 4, _nice_length: 16, _max_chain: 16 },
  { _func: deflate_slow, _max_lazy: 16, _good_length: 8, _nice_length: 16, _max_chain: 32 },
  { _func: deflate_slow, _max_lazy: 16, _good_length: 16, _nice_length: 32, _max_chain: 128 },
  { _func: deflate_slow, _max_lazy: 32, _good_length: 32, _nice_length: 128, _max_chain: 256 },
  { _func: deflate_slow, _max_lazy: 128, _good_length: 128, _nice_length: 256, _max_chain: 1024 },
  { _func: deflate_slow, _max_lazy: 258, _good_length: 258, _nice_length: 258, _max_chain: 4096 },
];

function RANK(f: number): number {
  return f * 2 - (f > 4 ? 9 : 0);
}

function UPDATE_HASH(s: DeflateState, h: number, c: number): number {
  return (((h << s._hash_shift) ^ c) & s._hash_mask) >>> 0;
}

function INSERT_STRING(s: DeflateState, str: number): number {
  s._ins_h = UPDATE_HASH(s, s._ins_h, s._window[str + (MIN_MATCH - 1)]);
  const match_head = (s._prev[str & s._w_mask] = s._head[s._ins_h]);
  s._head[s._ins_h] = str;
  return match_head;
}

function CLEAR_HASH(s: DeflateState): void {
  s._head[s._hash_size - 1] = 0;
  zmemzero(s._head, 0, (s._hash_size - 1) * s._head.BYTES_PER_ELEMENT);
}

function slide_hash(s: DeflateState): void {
  let n: number;
  let m: number;
  const wsize = s._w_size;
  n = s._hash_size;
  while (n > 0) {
    n--;
    m = s._head[n];
    s._head[n] = m >= wsize ? m - wsize : 0;
  }
  n = wsize;
  while (n > 0) {
    n--;
    m = s._prev[n];
    s._prev[n] = m >= wsize ? m - wsize : 0;
  }
}

function read_buf(strm: DeflateStream, buf: Uint8Array, bufIndex: number, size: number): number {
  let len = strm.avail_in;

  if (len > size) {
    len = size;
  }
  if (len == 0) {
    return 0;
  }
  strm.avail_in -= len;

  zmemcpy(buf, bufIndex, strm.next_in, strm.next_in_index, len);
  if (strm._state._wrap == 1) {
    strm._adler = adler32(strm._adler, new Uint8Array(buf.buffer, buf.byteOffset + bufIndex, len), len);
  } else if (strm._state._wrap == 2) {
    strm._adler = crc32(strm._adler, new Uint8Array(buf.buffer, buf.byteOffset + bufIndex, len), len);
  }
  strm.next_in_index += len;
  strm.total_in += len;

  return len;
}

function fill_window(s: DeflateState): void {
  let n: number;
  let more: number;
  const wsize = s._w_size;

  do {
    more = s._window_buffer_size - s._lookahead - s._strstart;

    if (more == 0 && s._strstart == 0 && s._lookahead == 0) {
      more = wsize;
    } else if (more == -1) {
      more--;
    }

    if (s._strstart >= wsize + MAX_DIST(s)) {
      zmemcpy(s._window, 0, s._window, wsize, wsize - more);
      s._match_start -= wsize;
      s._strstart -= wsize;
      s._block_start -= wsize;
      if (s._insert > s._strstart) {
        s._insert = s._strstart;
      }
      slide_hash(s);
      more += wsize;
    }
    if (s._strm.avail_in == 0) {
      break;
    }

    n = read_buf(s._strm, s._window, s._strstart + s._lookahead, more);
    s._lookahead += n;

    if (s._lookahead + s._insert >= MIN_MATCH) {
      let str = s._strstart - s._insert;
      s._ins_h = s._window[str];
      s._ins_h = UPDATE_HASH(s, s._ins_h, s._window[str + 1]);

      while (s._insert) {
        s._ins_h = UPDATE_HASH(s, s._ins_h, s._window[str + MIN_MATCH - 1]);
        s._prev[str & s._w_mask] = s._head[s._ins_h];
        s._head[s._ins_h] = str;
        str++;
        s._insert--;
        if (s._lookahead + s._insert < MIN_MATCH) {
          break;
        }
      }
    }
  } while (s._lookahead < MIN_LOOKAHEAD && s._strm.avail_in != 0);

  if (s._w_have < s._window_buffer_size) {
    const curr = s._strstart + s._lookahead;
    let init: number;

    if (s._w_have < curr) {
      init = s._window_buffer_size - curr;
      if (init > WIN_INIT) {
        init = WIN_INIT;
      }
      zmemzero(s._window, curr, init);
      s._w_have = curr + init;
    } else if (s._w_have < curr + WIN_INIT) {
      init = curr + WIN_INIT - s._w_have;
      if (init > s._window_buffer_size - s._w_have) {
        init = s._window_buffer_size - s._w_have;
      }
      zmemzero(s._window, s._w_have, init);
      s._w_have += init;
    }
  }
}

function deflateInit(strm: DeflateStream, level: number): number {
  return deflateInit2_(strm, level);
}

function deflateInit2(
  strm: DeflateStream,
  level: number,
  method?: number,
  windowBits?: number,
  memLevel?: number,
  strategy?: number,
): number {
  return deflateInit2_(strm, level, method, windowBits, memLevel, strategy);
}

function deflateInit2_(
  strm: DeflateStream,
  level: number,
  method: number = Z_DEFLATED,
  windowBits: number = DEF_WBITS,
  memLevel: number = DEF_MEM_LEVEL,
  strategy: number = Z_DEFAULT_STRATEGY,
): number {
  let wrap = 1;

  if (!strm) {
    return Z_STREAM_ERROR;
  }
  strm.msg = "";

  if (level == Z_DEFAULT_COMPRESSION) {
    level = 6;
  }
  if (windowBits < 0) {
    wrap = 0;
    if (windowBits < -WINDOW_BITS) {
      return Z_STREAM_ERROR;
    }
    windowBits = -windowBits;
  } else if (windowBits > WINDOW_BITS) {
    wrap = 2;
    windowBits -= GZIP_WRAPPER_OFFSET;
  }
  if (
    memLevel < 1 ||
    memLevel > MAX_MEM_LEVEL ||
    method != Z_DEFLATED ||
    windowBits < 8 ||
    windowBits > WINDOW_BITS ||
    level < 0 ||
    level > 9 ||
    strategy < 0 ||
    strategy > Z_FIXED ||
    (windowBits == 8 && wrap != 1)
  ) {
    return Z_STREAM_ERROR;
  }
  if (windowBits == 8) {
    windowBits = 9;
  }
  const s: DeflateState = createDeflateState(strm);
  if (!s) {
    return Z_MEM_ERROR;
  }
  strm._state = s;
  s._strm = strm;
  s._status = DeflateStatus.INIT_STATE;

  s._wrap = wrap;
  s._gzhead = undefined;
  s._w_bits = windowBits;
  s._w_size = 1 << s._w_bits;
  s._w_mask = s._w_size - 1;

  s._hash_bits = memLevel + 7;
  s._hash_size = 1 << s._hash_bits;
  s._hash_mask = s._hash_size - 1;
  s._hash_shift = (s._hash_bits + MIN_MATCH - 1) / MIN_MATCH;

  s._window = new Uint8Array(s._w_size * 2);
  s._prev = new Uint16Array(s._w_size);
  s._head = new Uint16Array(s._hash_size);

  s._w_have = 0;

  s._lit_bufsize = 1 << (memLevel + 6);

  s._pending_buffer = new Uint8Array(s._lit_bufsize * LIT_BUFS);
  s._pending_bit_buffer_size = s._lit_bufsize * 4;

  if (!s._window || !s._prev || !s._head || !s._pending_buffer) {
    s._status = DeflateStatus.FINISH_STATE;
    strm.msg = ERR_MSG(Z_MEM_ERROR);
    deflateEnd(strm);
    return Z_MEM_ERROR;
  }
  s._sym_buf = s._pending_buffer.subarray(s._lit_bufsize);
  s._sym_buf_index = s._pending_buffer_index + s._lit_bufsize;
  s._sym_end = (s._lit_bufsize - 1) * 3;

  s._level = level;
  s._strategy = strategy;
  s._method = method;

  return deflateReset(strm);
}

function deflateStateCheck(strm: DeflateStream): boolean {
  if (strm == null) {
    return true;
  }
  const s = strm._state;
  if (
    !s ||
    s._strm != strm ||
    (s._status != DeflateStatus.INIT_STATE &&
      s._status != DeflateStatus.GZIP_STATE &&
      s._status != DeflateStatus.EXTRA_STATE &&
      s._status != DeflateStatus.NAME_STATE &&
      s._status != DeflateStatus.COMMENT_STATE &&
      s._status != DeflateStatus.HCRC_STATE &&
      s._status != DeflateStatus.BUSY_STATE &&
      s._status != DeflateStatus.FINISH_STATE)
  ) {
    return true;
  }
  return false;
}

function deflateSetDictionary(strm: DeflateStream, dictionary: Uint8Array, dictLength: number): number {
  if (deflateStateCheck(strm) || dictionary == null) {
    return Z_STREAM_ERROR;
  }
  const s = strm._state;
  const wrap = s._wrap;
  if (wrap == 2 || (wrap == 1 && s._status != DeflateStatus.INIT_STATE) || s._lookahead) {
    return Z_STREAM_ERROR;
  }

  if (wrap == 1) {
    strm._adler = adler32(strm._adler, dictionary, dictLength);
  }
  s._wrap = 0;

  let dictionary_index = 0;
  if (dictLength >= s._w_size) {
    if (wrap == 0) {
      CLEAR_HASH(s);
      s._strstart = 0;
      s._block_start = 0;
      s._insert = 0;
    }
    dictionary_index = dictLength - s._w_size;
    dictLength = s._w_size;
  }

  const avail = strm.avail_in;
  const next = strm.next_in;
  strm.avail_in = dictLength;
  strm.next_in = dictionary;
  strm.next_in_index = dictionary_index;
  fill_window(s);
  while (s._lookahead >= MIN_MATCH) {
    let str = s._strstart;
    let n = s._lookahead - (MIN_MATCH - 1);
    do {
      s._ins_h = UPDATE_HASH(s, s._ins_h, s._window[str + MIN_MATCH - 1]);
      s._prev[str & s._w_mask] = s._head[s._ins_h];
      s._head[s._ins_h] = str;
      str++;
    } while (--n);
    s._strstart = str;
    s._lookahead = MIN_MATCH - 1;
    fill_window(s);
  }
  s._strstart += s._lookahead;
  s._block_start = s._strstart;
  s._insert = s._lookahead;
  s._lookahead = 0;
  s._match_length = s._prev_length = MIN_MATCH - 1;
  s._match_available = 0;
  strm.next_in = next;
  strm.next_in_index = avail - strm.avail_in;
  strm.avail_in = avail;
  s._wrap = wrap;
  return Z_OK;
}

function deflateGetDictionary(strm: DeflateStream, dictionary: Uint8Array, dictLength?: { _value: number }): number {
  if (deflateStateCheck(strm)) {
    return Z_STREAM_ERROR;
  }
  const s = strm._state;
  let len = s._strstart + s._lookahead;
  if (len > s._w_size) {
    len = s._w_size;
  }
  if (dictionary && len) {
    zmemcpy(dictionary, 0, s._window, s._strstart + s._lookahead - len, len);
  }
  if (dictLength) {
    dictLength._value = len;
  }
  return Z_OK;
}

function deflateResetKeep(strm: DeflateStream): number {
  let s: DeflateState;

  if (deflateStateCheck(strm)) {
    return Z_STREAM_ERROR;
  }

  strm.total_in = strm.total_out = 0;
  strm.msg = "";
  strm._data_type = Z_UNKNOWN;

  s = strm._state;
  s._pending = 0;
  s._pending_out_index = s._pending_buffer_index;
  if (s._wrap < 0) {
    s._wrap = -s._wrap;
  }
  s._status = s._wrap == 2 ? DeflateStatus.GZIP_STATE : DeflateStatus.INIT_STATE;
  strm._adler = s._wrap == 2 ? crc32(0) : adler32(0);
  s._last_flush = -2;

  _tr_init(s);

  return Z_OK;
}

function lm_init(s: DeflateState): void {
  s._window_buffer_size = 2 * s._w_size;

  CLEAR_HASH(s);

  s._max_lazy_match = CONFIGURATION_TABLE[s._level]._max_lazy;
  s._good_match = CONFIGURATION_TABLE[s._level]._good_length;
  s._nice_match = CONFIGURATION_TABLE[s._level]._nice_length;
  s._max_chain_length = CONFIGURATION_TABLE[s._level]._max_chain;

  s._strstart = 0;
  s._block_start = 0;
  s._lookahead = 0;
  s._insert = 0;
  s._match_length = s._prev_length = MIN_MATCH - 1;
  s._match_available = 0;
  s._ins_h = 0;
}

function deflateReset(strm: DeflateStream): number {
  const ret = deflateResetKeep(strm);
  if (ret == Z_OK) {
    lm_init(strm._state);
  }
  return ret;
}

function deflateSetHeader(strm: DeflateStream, head: GzipHeader): number {
  if (deflateStateCheck(strm) || strm._state._wrap != 2) {
    return Z_STREAM_ERROR;
  }
  strm._state._gzhead = head;
  return Z_OK;
}

function deflatePending(strm: DeflateStream, pending?: { _value: number }, bits?: { _value: number }): number {
  if (deflateStateCheck(strm)) {
    return Z_STREAM_ERROR;
  }
  if (pending) {
    pending._value = strm._state._pending;
  }
  if (bits) {
    bits._value = strm._state._bit_count;
  }
  return Z_OK;
}

function deflateUsed(strm: DeflateStream, bits?: { _value: number }): number {
  if (deflateStateCheck(strm)) {
    return Z_STREAM_ERROR;
  }
  if (bits) {
    bits._value = strm._state._bit_used;
  }
  return Z_OK;
}

function deflatePrime(strm: DeflateStream, bits: number, value: number): number {
  let s: DeflateState;
  let put;

  if (deflateStateCheck(strm)) {
    return Z_STREAM_ERROR;
  }
  s = strm._state;
  if (bits < 0 || bits > 16 || s._sym_buf_index < s._pending_out_index + ((BI_BUF_SIZE + 7) >> 3)) {
    return Z_BUF_ERROR;
  }
  do {
    put = BI_BUF_SIZE - s._bit_count;
    if (put > bits) {
      put = bits;
    }
    s._bit_buffer |= (value & ((1 << put) - 1)) << s._bit_count;
    s._bit_count += put;
    _tr_flush_bits(s);
    value >>= put;
    bits -= put;
  } while (bits);
  return Z_OK;
}

function deflateParams(strm: DeflateStream, level: number, strategy: number): number {
  let s: DeflateState;
  let func: CompressFunction;
  if (deflateStateCheck(strm)) {
    return Z_STREAM_ERROR;
  }
  s = strm._state;

  if (level == Z_DEFAULT_COMPRESSION) {
    level = 6;
  }
  if (level < 0 || level > 9 || strategy < 0 || strategy > Z_FIXED) {
    return Z_STREAM_ERROR;
  }
  func = CONFIGURATION_TABLE[s._level]._func;

  if ((strategy != s._strategy || func != CONFIGURATION_TABLE[level]._func) && s._last_flush != -2) {
    const err = deflate(strm, Z_BLOCK);
    if (err == Z_STREAM_ERROR) {
      return err;
    }
    if (strm.avail_in || s._strstart - s._block_start + s._lookahead) {
      return Z_BUF_ERROR;
    }
  }
  if (s._level != level) {
    if (s._level == 0 && s._matches != 0) {
      if (s._matches == 1) {
        slide_hash(s);
      } else {
        CLEAR_HASH(s);
      }
      s._matches = 0;
    }
    s._level = level;
    s._max_lazy_match = CONFIGURATION_TABLE[level]._max_lazy;
    s._good_match = CONFIGURATION_TABLE[level]._good_length;
    s._nice_match = CONFIGURATION_TABLE[level]._nice_length;
    s._max_chain_length = CONFIGURATION_TABLE[level]._max_chain;
  }
  s._strategy = strategy;
  return Z_OK;
}

function deflateTune(
  strm: DeflateStream,
  good_length: number,
  max_lazy: number,
  nice_length: number,
  max_chain: number,
): number {
  if (deflateStateCheck(strm)) {
    return Z_STREAM_ERROR;
  }
  const s = strm._state;
  s._good_match = good_length;
  s._max_lazy_match = max_lazy;
  s._nice_match = nice_length;
  s._max_chain_length = max_chain;
  return Z_OK;
}

function deflateBound(strm: DeflateStream, sourceLen: number): number {
  let s: DeflateState;
  let fixedlen, storelen, wraplen;

  fixedlen = sourceLen + (sourceLen >> 3) + (sourceLen >> 8) + (sourceLen >> 9) + 4;

  storelen = sourceLen + (sourceLen >> 5) + (sourceLen >> 7) + (sourceLen >> 11) + 7;

  if (deflateStateCheck(strm)) {
    return (fixedlen > storelen ? fixedlen : storelen) + 18;
  }

  s = strm._state;
  switch (s._wrap < 0 ? -s._wrap : s._wrap) {
    case 0:
      wraplen = 0;
      break;
    case 1:
      wraplen = 6 + (s._strstart ? 4 : 0);
      break;
    case 2:
      wraplen = 18;
      if (s._gzhead) {
        let str: Uint8Array;
        if (s._gzhead._extra && s._gzhead._extra.length) {
          wraplen += 2 + s._gzhead._extra_len;
        }
        str = s._gzhead._name;
        if (str) {
          for (let i = 0; i < str.length; i++) {
            wraplen++;
            if (str[i] == 0) {
              break;
            }
          }
        }
        str = s._gzhead._comment;
        if (str) {
          for (let i = 0; i < str.length; i++) {
            wraplen++;
            if (str[i] == 0) {
              break;
            }
          }
        }
        if (s._gzhead._hcrc) {
          wraplen += 2;
        }
      }
      break;
    default:
      wraplen = 18;
  }

  if (s._w_bits != 15 || s._hash_bits != 8 + 7) {
    return (s._w_bits <= s._hash_bits && s._level ? fixedlen : storelen) + wraplen;
  }

  return sourceLen + (sourceLen >> 12) + (sourceLen >> 14) + (sourceLen >> 25) + 13 - 6 + wraplen;
}

function putShortMSB(s: DeflateState, w: number): void {
  put_byte(s, w >> 8);
  put_byte(s, w & 0xff);
}

function flush_pending(strm: DeflateStream): void {
  let len;
  const s = strm._state;

  _tr_flush_bits(s);
  len = s._pending;
  if (len > strm.avail_out) {
    len = strm.avail_out;
  }
  if (len == 0) {
    return;
  }

  zmemcpy(strm.next_out, strm.next_out_index, s._pending_buffer, s._pending_out_index, len);
  strm.next_out_index += len;
  s._pending_out_index += len;
  strm.total_out += len;
  strm.avail_out -= len;
  s._pending -= len;
  if (s._pending == 0) {
    s._pending_out_index = s._pending_buffer_index;
  }
}

function HCRC_UPDATE(strm: DeflateStream, beg: number): void {
  const s = strm._state;
  if (s._gzhead && s._gzhead._hcrc) {
    strm._adler = crc32(
      strm._adler,
      new Uint8Array(s._pending_buffer.buffer, s._pending_buffer_index + beg, s._pending - beg),
      s._pending - beg,
    );
  }
}

function deflate(strm: DeflateStream, flush: number): number {
  let old_flush;
  const s = strm._state;

  if (deflateStateCheck(strm) || flush > Z_BLOCK || flush < 0) {
    return ERR_RETURN(strm, Z_STREAM_ERROR);
  }
  if (
    !strm.next_out ||
    (strm.avail_in != 0 && !strm.next_in) ||
    (s._status == DeflateStatus.FINISH_STATE && flush != Z_FINISH)
  ) {
    return ERR_RETURN(strm, Z_STREAM_ERROR);
  }
  if (strm.avail_out == 0) {
    return ERR_RETURN(strm, Z_BUF_ERROR);
  }
  old_flush = s._last_flush;
  s._last_flush = flush;

  if (s._pending != 0) {
    flush_pending(strm);
    if (strm.avail_out == 0) {
      s._last_flush = LAST_FLUSH;
      return Z_OK;
    }
  } else if (strm.avail_in == 0 && RANK(flush) <= RANK(old_flush) && flush != Z_FINISH) {
    return ERR_RETURN(strm, Z_BUF_ERROR);
  }

  if (s._status == DeflateStatus.FINISH_STATE && strm.avail_in != 0) {
    return ERR_RETURN(strm, Z_BUF_ERROR);
  }

  if (s._status == DeflateStatus.INIT_STATE && s._wrap == 0) {
    s._status = DeflateStatus.BUSY_STATE;
  }
  if (s._status == DeflateStatus.INIT_STATE) {
    let header = (Z_DEFLATED + ((s._w_bits - 8) << 4)) << 8;
    let level_flags;

    if (s._strategy >= Z_HUFFMAN_ONLY || s._level < 2) {
      level_flags = 0;
    } else if (s._level < 6) {
      level_flags = 1;
    } else if (s._level == 6) {
      level_flags = 2;
    } else {
      level_flags = 3;
    }
    header |= level_flags << 6;
    if (s._strstart != 0) {
      header |= PRESET_DICT;
    }
    header += 31 - (header % 31);

    putShortMSB(s, header);

    if (s._strstart != 0) {
      putShortMSB(s, strm._adler >> 16);
      putShortMSB(s, strm._adler & 0xffff);
    }
    strm._adler = 1;
    s._status = DeflateStatus.BUSY_STATE;

    flush_pending(strm);
    if (s._pending != 0) {
      s._last_flush = LAST_FLUSH;
      return Z_OK;
    }
  }
  if (s._status == DeflateStatus.GZIP_STATE) {
    strm._adler = crc32(0);
    put_byte(s, 31);
    put_byte(s, 139);
    put_byte(s, 8);
    if (!s._gzhead) {
      put_byte(s, 0);
      put_byte(s, 0);
      put_byte(s, 0);
      put_byte(s, 0);
      put_byte(s, 0);
      put_byte(s, s._level == 9 ? 2 : s._strategy >= Z_HUFFMAN_ONLY || s._level < 2 ? 4 : 0);
      put_byte(s, OS_CODE);
      s._status = DeflateStatus.BUSY_STATE;

      flush_pending(strm);
      if (s._pending != 0) {
        s._last_flush = LAST_FLUSH;
        return Z_OK;
      }
    } else {
      put_byte(
        s,
        (s._gzhead._text ? 1 : 0) +
          (s._gzhead._hcrc ? 2 : 0) +
          (s._gzhead._extra == null ? 0 : 4) +
          (s._gzhead._name == null ? 0 : 8) +
          (s._gzhead._comment == null ? 0 : 16),
      );
      put_byte(s, s._gzhead._time & 0xff);
      put_byte(s, (s._gzhead._time >>> 8) & 0xff);
      put_byte(s, (s._gzhead._time >>> 16) & 0xff);
      put_byte(s, (s._gzhead._time >>> 24) & 0xff);
      put_byte(s, s._level == 9 ? 2 : s._strategy >= Z_HUFFMAN_ONLY || s._level < 2 ? 4 : 0);
      put_byte(s, s._gzhead._os & 0xff);
      if (s._gzhead._extra != null) {
        put_byte(s, s._gzhead._extra_len & 0xff);
        put_byte(s, (s._gzhead._extra_len >>> 8) & 0xff);
      }
      if (s._gzhead._hcrc) {
        strm._adler = crc32(strm._adler, s._pending_buffer, s._pending);
      }
      s._gzindex = 0;
      s._status = DeflateStatus.EXTRA_STATE;
    }
  }
  if (s._status == DeflateStatus.EXTRA_STATE) {
    if (s._gzhead && s._gzhead._extra != null) {
      let beg = s._pending;
      let left = (s._gzhead._extra_len & 0xffff) - s._gzindex;
      while (s._pending + left > s._pending_bit_buffer_size) {
        const copy = s._pending_bit_buffer_size - s._pending;
        zmemcpy(s._pending_buffer, s._pending, s._gzhead._extra, s._gzindex, copy);
        s._pending = s._pending_bit_buffer_size;
        HCRC_UPDATE(strm, beg);
        s._gzindex += copy;
        flush_pending(strm);
        if (s._pending != 0) {
          s._last_flush = LAST_FLUSH;
          return Z_OK;
        }
        beg = 0;
        left -= copy;
      }
      zmemcpy(s._pending_buffer, s._pending, s._gzhead._extra, s._gzindex, left);
      s._pending += left;
      HCRC_UPDATE(strm, beg);
      s._gzindex = 0;
    }
    s._status = DeflateStatus.NAME_STATE;
  }
  if (s._status == DeflateStatus.NAME_STATE) {
    if (s._gzhead && s._gzhead._name && s._gzhead._name.length) {
      let beg = s._pending;
      let val;
      do {
        if (s._pending == s._pending_bit_buffer_size) {
          HCRC_UPDATE(strm, beg);
          flush_pending(strm);
          if (s._pending != 0) {
            s._last_flush = LAST_FLUSH;
            return Z_OK;
          }
          beg = 0;
        }
        val = s._gzhead._name[s._gzindex++];
        put_byte(s, val);
      } while (val != 0);
      HCRC_UPDATE(strm, beg);
      s._gzindex = 0;
    }
    s._status = DeflateStatus.COMMENT_STATE;
  }
  if (s._status == DeflateStatus.COMMENT_STATE) {
    if (s._gzhead && s._gzhead._comment && s._gzhead._comment.length) {
      let beg = s._pending;
      let val;
      do {
        if (s._pending == s._pending_bit_buffer_size) {
          HCRC_UPDATE(strm, beg);
          flush_pending(strm);
          if (s._pending != 0) {
            s._last_flush = LAST_FLUSH;
            return Z_OK;
          }
          beg = 0;
        }
        val = s._gzhead._comment[s._gzindex++];
        put_byte(s, val);
      } while (val != 0);
      HCRC_UPDATE(strm, beg);
    }
    s._status = DeflateStatus.HCRC_STATE;
  }
  if (s._status == DeflateStatus.HCRC_STATE) {
    if (s._gzhead && s._gzhead._hcrc) {
      if (s._pending + 2 > s._pending_bit_buffer_size) {
        flush_pending(strm);
        if (s._pending != 0) {
          s._last_flush = LAST_FLUSH;
          return Z_OK;
        }
      }
      put_byte(s, strm._adler & 0xff);
      put_byte(s, (strm._adler >>> 8) & 0xff);
      strm._adler = crc32(0);
    }
    s._status = DeflateStatus.BUSY_STATE;

    flush_pending(strm);
    if (s._pending != 0) {
      s._last_flush = LAST_FLUSH;
      return Z_OK;
    }
  }

  if (strm.avail_in != 0 || s._lookahead != 0 || (flush != Z_NO_FLUSH && s._status != DeflateStatus.FINISH_STATE)) {
    const bstate: BlockState =
      s._level == 0
        ? deflate_stored(s, flush)
        : s._strategy == Z_HUFFMAN_ONLY
          ? deflate_huff(s, flush)
          : s._strategy == Z_RLE
            ? deflate_rle(s, flush)
            : CONFIGURATION_TABLE[s._level]._func(s, flush);

    if (bstate == BlockState.FINISH_STARTED || bstate == BlockState.FINISH_DONE) {
      s._status = DeflateStatus.FINISH_STATE;
    }
    if (bstate == BlockState.NEED_MORE || bstate == BlockState.FINISH_STARTED) {
      if (strm.avail_out == 0) {
        s._last_flush = LAST_FLUSH;
      }
      return Z_OK;
    }
    if (bstate == BlockState.BLOCK_DONE) {
      if (flush == Z_PARTIAL_FLUSH) {
        _tr_align(s);
      } else if (flush != Z_BLOCK) {
        _tr_stored_block(s, null, 0, 0);
        if (flush == Z_FULL_FLUSH) {
          CLEAR_HASH(s);
          if (s._lookahead == 0) {
            s._strstart = 0;
            s._block_start = 0;
            s._insert = 0;
          }
        }
      }
      flush_pending(strm);
      if (strm.avail_out == 0) {
        s._last_flush = LAST_FLUSH;
        return Z_OK;
      }
    }
  }

  if (flush != Z_FINISH) {
    return Z_OK;
  }
  if (s._wrap <= 0) {
    return Z_STREAM_END;
  }

  if (s._wrap == 2) {
    put_byte(s, strm._adler & 0xff);
    put_byte(s, (strm._adler >>> 8) & 0xff);
    put_byte(s, (strm._adler >>> 16) & 0xff);
    put_byte(s, (strm._adler >>> 24) & 0xff);
    put_byte(s, strm.total_in & 0xff);
    put_byte(s, (strm.total_in >>> 8) & 0xff);
    put_byte(s, (strm.total_in >>> 16) & 0xff);
    put_byte(s, (strm.total_in >>> 24) & 0xff);
  } else {
    putShortMSB(s, (strm._adler >>> 16) & 0xffff);
    putShortMSB(s, strm._adler & 0xffff);
  }
  flush_pending(strm);
  if (s._wrap > 0) {
    s._wrap = -s._wrap;
  }
  return s._pending != 0 ? Z_OK : Z_STREAM_END;
}

function deflateEnd(strm: DeflateStream): number {
  if (deflateStateCheck(strm)) {
    return Z_STREAM_ERROR;
  }
  const s = strm._state;
  const status = s._status;
  s._window = EMPTY_UINT8;
  s._prev = EMPTY_UINT16;
  s._head = EMPTY_UINT16;
  s._pending_buffer = EMPTY_UINT8;
  s._sym_buf = EMPTY_UINT8;
  s._heap = new Int32Array(0);
  s._depth = EMPTY_UINT8;
  s._bl_count = EMPTY_UINT16;
  s._dyn_ltree.length = 0;
  s._dyn_dtree.length = 0;
  s._bl_tree.length = 0;
  s._gzhead = undefined;
  s._pending_buffer_index = 0;
  s._pending_out_index = 0;
  s._sym_buf_index = 0;
  return status == DeflateStatus.BUSY_STATE ? Z_DATA_ERROR : Z_OK;
}

function deflateCopy(dest: DeflateStream, source: DeflateStream): number {
  if (deflateStateCheck(source) || !dest) {
    return Z_STREAM_ERROR;
  }

  const ss = source._state;

  Object.assign(dest, source);

  const ds: DeflateState = Object.assign({}, ss, {
    _strm: dest,
    _window: new Uint8Array(ss._window.length),
    _prev: new Uint16Array(ss._prev.length),
    _head: new Uint16Array(ss._head.length),
    _pending_buffer: new Uint8Array(ss._pending_buffer.length),
  });

  if (!ds || !ds._prev || !ds._head || !ds._pending_buffer) {
    deflateEnd(dest);
    return Z_MEM_ERROR;
  }

  zmemcpy(ds._window, 0, ss._window, 0, ss._window.length);
  zmemcpy(ds._prev, 0, ss._prev, 0, ss._prev.length);
  zmemcpy(ds._head, 0, ss._head, 0, ss._head.length);
  zmemcpy(ds._pending_buffer, 0, ss._pending_buffer, 0, ss._pending_buffer.length);
  dest._state = ds;

  ds._pending_out_index = ss._pending_out_index;
  ds._sym_buf_index = ds._lit_bufsize;

  ds._l_desc._dyn_tree = ds._dyn_ltree;
  ds._d_desc._dyn_tree = ds._dyn_dtree;
  ds._bl_desc._dyn_tree = ds._bl_tree;

  return Z_OK;
}

function longest_match(s: DeflateState, cur_match: number): number {
  let chain_length = s._max_chain_length;
  let scan_index = s._strstart;
  let matchIndex: number;
  let len: number;
  let best_len = s._prev_length;
  let nice_match = s._nice_match;
  const limit = s._strstart > MAX_DIST(s) ? s._strstart - MAX_DIST(s) : 0;
  const prev = s._prev;
  const wmask = s._w_mask;

  const scan_start = s._window[scan_index];
  const scan_next = s._window[scan_index + 1];
  let scan_end1 = s._window[scan_index + best_len - 1];
  let scan_end = s._window[scan_index + best_len];

  if (s._prev_length >= s._good_match) {
    chain_length >>= 2;
  }
  if (nice_match > s._lookahead) {
    nice_match = s._lookahead;
  }

  do {
    matchIndex = cur_match;

    if (
      s._window[matchIndex + best_len] != scan_end ||
      s._window[matchIndex + best_len - 1] != scan_end1 ||
      s._window[matchIndex] != scan_start ||
      s._window[matchIndex + 1] != scan_next
    ) {
      continue;
    }

    const maxCompare = Math.min(MAX_MATCH, s._lookahead);
    let k = 2;
    while (k < maxCompare && s._window[scan_index + k] == s._window[matchIndex + k]) {
      k++;
    }
    len = k;

    if (len > best_len) {
      s._match_start = cur_match;
      best_len = len;
      if (len >= nice_match) {
        break;
      }
      scan_end1 = s._window[scan_index + best_len - 1];
      scan_end = s._window[scan_index + best_len];
    }
  } while ((cur_match = prev[cur_match & wmask]) > limit && --chain_length != 0);

  if (best_len <= s._lookahead) {
    return best_len;
  }
  return s._lookahead;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function check_match(_s: DeflateState, _strstart: number, _match_start: number, _match_length: number): void {}

function FLUSH_BLOCK_ONLY(s: DeflateState, last: number): void {
  _tr_flush_block(s, s._window, s._strstart - s._block_start, last, s._block_start);
  s._block_start = s._strstart;
  flush_pending(s._strm);
}

function FLUSH_BLOCK(s: DeflateState, last: boolean): BlockState | null {
  FLUSH_BLOCK_ONLY(s, last ? 1 : 0);
  if (s._strm.avail_out == 0) {
    return last ? BlockState.FINISH_STARTED : BlockState.NEED_MORE;
  }
  return null;
}

const MAX_STORED = 65535;

function MIN(a: number, b: number): number {
  return a < b ? a : b;
}

function deflate_stored(s: DeflateState, flush: number): BlockState {
  let min_block = MIN(s._pending_bit_buffer_size - 5, s._w_size);

  let last = 0;
  let len: number, left: number, have: number;
  let used = s._strm.avail_in;
  do {
    len = MAX_STORED;
    have = (s._bit_count + 42) >> 3;
    if (s._strm.avail_out < have) {
      break;
    }

    have = s._strm.avail_out - have;
    left = s._strstart - s._block_start;
    if (len > left + s._strm.avail_in) {
      len = left + s._strm.avail_in;
    }
    if (len > have) {
      len = have;
    }

    if (len < min_block && ((len == 0 && flush != Z_FINISH) || flush == Z_NO_FLUSH || len != left + s._strm.avail_in)) {
      break;
    }

    last = flush == Z_FINISH && len == left + s._strm.avail_in ? 1 : 0;
    _tr_stored_block(s, null, 0, last);

    s._pending_buffer[s._pending - 4] = len;
    s._pending_buffer[s._pending - 3] = len >> 8;
    s._pending_buffer[s._pending - 2] = ~len;
    s._pending_buffer[s._pending - 1] = ~len >> 8;

    flush_pending(s._strm);

    if (left) {
      if (left > len) {
        left = len;
      }
      zmemcpy(s._strm.next_out, s._strm.next_out_index, s._window, s._block_start, left);
      s._strm.next_out_index += left;
      s._strm.avail_out -= left;
      s._strm.total_out += left;
      s._block_start += left;
      len -= left;
    }

    if (len) {
      read_buf(s._strm, s._strm.next_out, s._strm.next_out_index, len);
      s._strm.next_out_index += len;
      s._strm.avail_out -= len;
      s._strm.total_out += len;
    }
  } while (last == 0);

  used -= s._strm.avail_in;
  if (used) {
    if (used >= s._w_size) {
      s._matches = 2;
      const next_in_index = s._strm.next_in_index - s._w_size;
      zmemcpy(s._window, 0, s._strm.next_in, next_in_index, s._w_size);
      s._strstart = s._w_size;
      s._insert = s._strstart;
    } else {
      if (s._window_buffer_size - s._strstart <= used) {
        s._strstart -= s._w_size;
        zmemcpy(s._window, 0, s._window, s._w_size, s._strstart);
        if (s._matches < 2) {
          s._matches++;
        }
        if (s._insert > s._strstart) {
          s._insert = s._strstart;
        }
      }
      zmemcpy(s._window, s._strstart, s._strm.next_in, s._strm.next_in_index - used, used);
      s._strstart += used;
      s._insert += MIN(used, s._w_size - s._insert);
    }
    s._block_start = s._strstart;
  }
  if (s._w_have < s._strstart) {
    s._w_have = s._strstart;
  }

  if (last) {
    s._bit_used = 8;
    return BlockState.FINISH_DONE;
  }

  if (flush != Z_NO_FLUSH && flush != Z_FINISH && s._strm.avail_in == 0 && s._strstart == s._block_start) {
    return BlockState.BLOCK_DONE;
  }

  have = s._window_buffer_size - s._strstart;
  if (s._strm.avail_in > have && s._block_start >= s._w_size) {
    s._block_start -= s._w_size;
    s._strstart -= s._w_size;
    zmemcpy(s._window, 0, s._window, s._w_size, s._strstart);
    if (s._matches < 2) {
      s._matches++;
    }
    have += s._w_size;
    if (s._insert > s._strstart) {
      s._insert = s._strstart;
    }
  }
  if (have > s._strm.avail_in) {
    have = s._strm.avail_in;
  }
  if (have) {
    read_buf(s._strm, s._window, s._strstart, have);
    s._strstart += have;
    s._insert += MIN(have, s._w_size - s._insert);
  }
  if (s._w_have < s._strstart) {
    s._w_have = s._strstart;
  }

  have = (s._bit_count + 42) >> 3;

  have = MIN(s._pending_bit_buffer_size - have, MAX_STORED);
  min_block = MIN(have, s._w_size);
  left = s._strstart - s._block_start;
  if (
    left >= min_block ||
    ((left || flush == Z_FINISH) && flush != Z_NO_FLUSH && s._strm.avail_in == 0 && left <= have)
  ) {
    len = MIN(left, have);
    last = flush == Z_FINISH && s._strm.avail_in == 0 && len == left ? 1 : 0;
    _tr_stored_block(s, s._window, len, last, s._block_start);
    s._block_start += len;
    flush_pending(s._strm);
  }

  if (last) {
    s._bit_used = 8;
  }
  return last ? BlockState.FINISH_STARTED : BlockState.NEED_MORE;
}

function deflate_fast(s: DeflateState, flush: number): BlockState {
  let hash_head: InflatePos;
  let bflush = false;

  for (;;) {
    if (s._lookahead < MIN_LOOKAHEAD) {
      fill_window(s);
      if (s._lookahead < MIN_LOOKAHEAD && flush == Z_NO_FLUSH) {
        return BlockState.NEED_MORE;
      }
      if (s._lookahead == 0) {
        break;
      }
    }

    hash_head = 0;
    if (s._lookahead >= MIN_MATCH) {
      hash_head = INSERT_STRING(s, s._strstart);
    }

    if (hash_head != 0 && s._strstart - hash_head <= MAX_DIST(s)) {
      s._match_length = longest_match(s, hash_head);
    }
    if (s._match_length >= MIN_MATCH) {
      check_match(s, s._strstart, s._match_start, s._match_length);
      bflush = _tr_tally_dist(s, s._strstart - s._match_start, s._match_length - MIN_MATCH);

      s._lookahead -= s._match_length;

      if (s._match_length <= s._max_lazy_match && s._lookahead >= MIN_MATCH) {
        s._match_length--;
        do {
          s._strstart++;
          hash_head = INSERT_STRING(s, s._strstart);
        } while (--s._match_length != 0);
        s._strstart++;
      } else {
        s._strstart += s._match_length;
        s._match_length = 0;
        s._ins_h = s._window[s._strstart];
        s._ins_h = UPDATE_HASH(s, s._ins_h, s._window[s._strstart + 1]);
      }
    } else {
      bflush = _tr_tally_lit(s, s._window[s._strstart]);
      s._lookahead--;
      s._strstart++;
    }
    if (bflush) {
      const result = FLUSH_BLOCK(s, false);
      if (result != null) {
        return result;
      }
    }
  }
  s._insert = s._strstart < MIN_MATCH - 1 ? s._strstart : MIN_MATCH - 1;
  if (flush == Z_FINISH) {
    const result = FLUSH_BLOCK(s, true);
    if (result != null) {
      return result;
    }
    return BlockState.FINISH_DONE;
  }
  if (s._sym_next) {
    const result = FLUSH_BLOCK(s, false);
    if (result != null) {
      return result;
    }
  }
  return BlockState.BLOCK_DONE;
}

function deflate_slow(s: DeflateState, flush: number): BlockState {
  let hash_head: InflatePos;
  let bflush: boolean = false;

  for (;;) {
    if (s._lookahead < MIN_LOOKAHEAD) {
      fill_window(s);
      if (s._lookahead < MIN_LOOKAHEAD && flush == Z_NO_FLUSH) {
        return BlockState.NEED_MORE;
      }
      if (s._lookahead == 0) {
        break;
      }
    }

    hash_head = 0;
    if (s._lookahead >= MIN_MATCH) {
      hash_head = INSERT_STRING(s, s._strstart);
    }

    s._prev_length = s._match_length;
    s._prev_match = s._match_start;
    s._match_length = MIN_MATCH - 1;

    if (hash_head != 0 && s._prev_length < s._max_lazy_match && s._strstart - hash_head <= MAX_DIST(s)) {
      s._match_length = longest_match(s, hash_head);

      if (s._match_length <= 5 && s._strategy == Z_FILTERED) {
        s._match_length = MIN_MATCH - 1;
      }
    }
    if (s._prev_length >= MIN_MATCH && s._match_length <= s._prev_length) {
      const max_insert = s._strstart + s._lookahead - MIN_MATCH;

      check_match(s, s._strstart - 1, s._prev_match, s._prev_length);

      bflush = _tr_tally_dist(s, s._strstart - 1 - s._prev_match, s._prev_length - MIN_MATCH);
      s._lookahead -= s._prev_length - 1;
      s._prev_length -= 2;
      do {
        if (++s._strstart <= max_insert) {
          hash_head = INSERT_STRING(s, s._strstart);
        }
      } while (--s._prev_length != 0);
      s._match_available = 0;
      s._match_length = MIN_MATCH - 1;
      s._strstart++;

      if (bflush) {
        const result = FLUSH_BLOCK(s, false);
        if (result != null) {
          return result;
        }
      }
    } else if (s._match_available) {
      bflush = _tr_tally_lit(s, s._window[s._strstart - 1]);
      if (bflush) {
        FLUSH_BLOCK_ONLY(s, 0);
      }
      s._strstart++;
      s._lookahead--;
      if (s._strm.avail_out == 0) {
        return BlockState.NEED_MORE;
      }
    } else {
      s._match_available = 1;
      s._strstart++;
      s._lookahead--;
    }
  }

  if (s._match_available) {
    bflush = _tr_tally_lit(s, s._window[s._strstart - 1]);
    s._match_available = 0;
  }
  s._insert = s._strstart < MIN_MATCH - 1 ? s._strstart : MIN_MATCH - 1;
  if (flush == Z_FINISH) {
    const result = FLUSH_BLOCK(s, true);
    if (result != null) {
      return result;
    }
    return BlockState.FINISH_DONE;
  }
  if (s._sym_next) {
    const result = FLUSH_BLOCK(s, false);
    if (result != null) {
      return result;
    }
  }
  return BlockState.BLOCK_DONE;
}

function deflate_rle(s: DeflateState, flush: number): BlockState {
  let bflush;
  let prev;
  let scan, strend;
  for (;;) {
    if (s._lookahead <= MAX_MATCH) {
      fill_window(s);
      if (s._lookahead <= MAX_MATCH && flush == Z_NO_FLUSH) {
        return BlockState.NEED_MORE;
      }
      if (s._lookahead == 0) {
        break;
      }
    }

    s._match_length = 0;
    if (s._lookahead >= MIN_MATCH && s._strstart > 0) {
      scan = s._strstart - 1;
      prev = s._window[scan];
      if (prev == ++scan && prev == ++scan && prev == ++scan) {
        strend = s._strstart + MAX_MATCH;
        do {} while (
          prev == ++scan &&
          prev == ++scan &&
          prev == ++scan &&
          prev == ++scan &&
          prev == ++scan &&
          prev == ++scan &&
          prev == ++scan &&
          prev == ++scan &&
          scan < strend
        );
        s._match_length = MAX_MATCH - (strend - scan);
        if (s._match_length > s._lookahead) {
          s._match_length = s._lookahead;
        }
      }
    }

    if (s._match_length >= MIN_MATCH) {
      check_match(s, s._strstart, s._strstart - 1, s._match_length);

      bflush = _tr_tally_dist(s, 1, s._match_length - MIN_MATCH);
      s._lookahead -= s._match_length;
      s._strstart += s._match_length;
      s._match_length = 0;
    } else {
      bflush = _tr_tally_lit(s, s._window[s._strstart]);
      s._lookahead--;
      s._strstart++;
    }
    if (bflush) {
      const result = FLUSH_BLOCK(s, false);
      if (result != null) {
        return result;
      }
    }
  }
  s._insert = 0;
  if (flush == Z_FINISH) {
    const result = FLUSH_BLOCK(s, true);
    if (result != null) {
      return result;
    }
    return BlockState.FINISH_DONE;
  }
  if (s._sym_next) {
    const result = FLUSH_BLOCK(s, false);
    if (result != null) {
      return result;
    }
  }
  return BlockState.BLOCK_DONE;
}

function deflate_huff(s: DeflateState, flush: number): BlockState {
  let bflush = false;
  for (;;) {
    if (s._lookahead == 0) {
      fill_window(s);
      if (s._lookahead == 0) {
        if (flush == Z_NO_FLUSH) {
          return BlockState.NEED_MORE;
        }
        break;
      }
    }

    s._match_length = 0;

    bflush = _tr_tally_lit(s, s._window[s._strstart]);
    s._lookahead--;
    s._strstart++;
    if (bflush) {
      const result = FLUSH_BLOCK(s, false);
      if (result != null) {
        return result;
      }
    }
  }
  s._insert = 0;
  if (flush == Z_FINISH) {
    const result = FLUSH_BLOCK(s, true);
    if (result != null) {
      return result;
    }
    return BlockState.FINISH_DONE;
  }
  if (s._sym_next) {
    const result = FLUSH_BLOCK(s, false);
    if (result != null) {
      return result;
    }
  }
  return BlockState.BLOCK_DONE;
}
