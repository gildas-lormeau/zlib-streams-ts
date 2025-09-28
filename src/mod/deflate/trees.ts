import { BL_ORDER, Z_BINARY, Z_TEXT, Z_UNKNOWN, Z_FIXED } from "../common/constants";
import { DeflateState, HuffmanTreeNode, TreeDescription, StaticTreeDescription } from "../common/types";
import { zmemcpy } from "../common/utils";

import {
  LITERALS,
  L_CODES,
  D_CODES,
  BL_CODES,
  HEAP_SIZE,
  MAX_BITS,
  BI_BUF_SIZE,
  EXTRA_LBITS,
  EXTRA_DBITS,
  EXTRA_BLBITS,
  END_BLOCK,
  REP_3_6,
  REPZ_3_10,
  REPZ_11_138,
  STORED_BLOCK,
  STATIC_TREES,
  DYN_TREES,
  LENGTH_CODE,
  STATIC_LTREE,
  STATIC_DTREE,
  BASE_DIST,
  BASE_LENGTH,
} from "./constants";
import { createHuffmanTreeNode, bitReverse, put_byte, put_short, d_code } from "./utils";

export function bi_flush(s: DeflateState): void {
  if (s._bit_count == 16) {
    put_short(s, s._bit_buffer);
    s._bit_buffer = 0;
    s._bit_count = 0;
  } else if (s._bit_count >= 8) {
    put_byte(s, s._bit_buffer);
    s._bit_buffer >>= 8;
    s._bit_count -= 8;
  }
}

export function bi_windup(s: DeflateState): void {
  if (s._bit_count > 8) {
    put_short(s, s._bit_buffer);
  } else if (s._bit_count > 0) {
    put_byte(s, s._bit_buffer);
  }
  s._bit_used = ((s._bit_count - 1) & 7) + 1;
  s._bit_buffer = 0;
  s._bit_count = 0;
}

export function gen_codes(
  tree: ReadonlyArray<HuffmanTreeNode>,
  max_code: number,
  bl_count_arr: number[] | ArrayLike<number>,
): void {
  const next_code: number[] = [];
  let code = 0;
  let bits;
  let n;
  for (bits = 1; bits <= MAX_BITS; bits++) {
    code = (code + bl_count_arr[bits - 1]) << 1;
    next_code[bits] = code;
  }

  for (n = 0; n <= max_code; n++) {
    const len = tree[n]._len;
    if (len == 0) {
      continue;
    }

    tree[n]._code = bitReverse(next_code[len]++, len);
  }
}

export function send_bits(s: DeflateState, value: number, length: number): void {
  if (s._bit_count > BI_BUF_SIZE - length) {
    s._bit_buffer = (s._bit_buffer | (value << s._bit_count)) & 0xffff;
    put_short(s, s._bit_buffer);
    s._bit_buffer = (value >> (BI_BUF_SIZE - s._bit_count)) & 0xffff;
    s._bit_count += length - BI_BUF_SIZE;
  } else {
    s._bit_buffer = (s._bit_buffer | (value << s._bit_count)) & 0xffff;
    s._bit_count += length;
  }
}

export function init_block(s: DeflateState): void {
  for (let n = 0; n < s._dyn_ltree.length; n++) {
    s._dyn_ltree[n]._freq = 0;
  }
  for (let n = 0; n < s._dyn_dtree.length; n++) {
    s._dyn_dtree[n]._freq = 0;
  }
  for (let n = 0; n < s._bl_tree.length; n++) {
    s._bl_tree[n]._freq = 0;
  }
  s._dyn_ltree[END_BLOCK]._freq = 1;
  s._opt_len = s._static_len = 0;
  s._sym_next = s._matches = 0;
}

export function _tr_init(s: DeflateState): void {
  if (s._dyn_ltree && s._dyn_ltree.length >= HEAP_SIZE) {
    for (let i = 0; i < HEAP_SIZE; i++) {
      s._dyn_ltree[i] = createHuffmanTreeNode();
    }
  } else {
    s._dyn_ltree = [];
    for (let i = 0; i < HEAP_SIZE; i++) {
      s._dyn_ltree.push(createHuffmanTreeNode());
    }
  }
  if (s._dyn_dtree && s._dyn_dtree.length >= 2 * D_CODES + 1) {
    for (let i = 0; i < 2 * D_CODES + 1; i++) {
      s._dyn_dtree[i] = createHuffmanTreeNode();
    }
  } else {
    s._dyn_dtree = [];
    for (let i = 0; i < 2 * D_CODES + 1; i++) {
      s._dyn_dtree.push(createHuffmanTreeNode());
    }
  }
  if (s._bl_tree && s._bl_tree.length >= 2 * BL_CODES + 1) {
    for (let i = 0; i < 2 * BL_CODES + 1; i++) {
      s._bl_tree[i] = createHuffmanTreeNode();
    }
  } else {
    s._bl_tree = [];
    for (let i = 0; i < 2 * BL_CODES + 1; i++) {
      s._bl_tree.push(createHuffmanTreeNode());
    }
  }

  s._l_desc = new TreeDescription(
    s._dyn_ltree,
    new StaticTreeDescription(STATIC_LTREE, EXTRA_LBITS, LITERALS + 1, L_CODES, MAX_BITS),
  );
  s._d_desc = new TreeDescription(
    s._dyn_dtree,
    new StaticTreeDescription(STATIC_DTREE, EXTRA_DBITS, 0, D_CODES, MAX_BITS),
  );
  s._bl_desc = new TreeDescription(s._bl_tree, new StaticTreeDescription(null, EXTRA_BLBITS, 0, BL_CODES, 7));

  s._bit_buffer = 0;
  s._bit_count = 0;
  s._bit_used = 0;

  init_block(s);
}

const SMALLEST = 1;

export function pqremove(s: DeflateState, tree: ReadonlyArray<HuffmanTreeNode>, top: number): number {
  top = s._heap[SMALLEST];
  s._heap[SMALLEST] = s._heap[s._heap_len--];
  pqdownheap(s, tree, SMALLEST);
  return top;
}

function smaller(tree: ReadonlyArray<HuffmanTreeNode>, n: number, m: number, depth: Uint8Array): boolean {
  return tree[n]._freq < tree[m]._freq || (tree[n]._freq == tree[m]._freq && depth[n] <= depth[m]);
}

export function pqdownheap(s: DeflateState, tree: ReadonlyArray<HuffmanTreeNode>, k: number): void {
  const v = s._heap[k];
  let j = k << 1;
  while (j <= s._heap_len) {
    if (j < s._heap_len && smaller(tree, s._heap[j + 1], s._heap[j], s._depth)) {
      j++;
    }

    if (smaller(tree, v, s._heap[j], s._depth)) {
      break;
    }

    s._heap[k] = s._heap[j];
    k = j;

    j <<= 1;
  }
  s._heap[k] = v;
}

export function gen_bitlen(s: DeflateState, desc: TreeDescription): void {
  const tree: ReadonlyArray<HuffmanTreeNode> = desc._dyn_tree;
  const max_code: number = desc._max_code;
  const stree: ReadonlyArray<HuffmanTreeNode> | null = desc._stat_desc._static_tree;
  const extra: ArrayLike<number> | null = desc._stat_desc._extra_bits;
  const base: number = desc._stat_desc._extra_base;
  const max_length: number = desc._stat_desc._max_length;
  let h;
  let n, m;
  let bits;
  let xbits;
  let f;
  let overflow = 0;

  for (bits = 0; bits <= MAX_BITS; bits++) {
    s._bl_count[bits] = 0;
  }

  tree[s._heap[s._heap_max]]._len = 0;

  for (h = s._heap_max + 1; h < HEAP_SIZE; h++) {
    n = s._heap[h];
    bits = tree[tree[n]._dad]._len + 1;
    if (bits > max_length) {
      bits = max_length;
      overflow++;
    }
    tree[n]._len = bits;

    if (n > max_code) {
      continue;
    }
    s._bl_count[bits]++;
    xbits = 0;
    if (n >= base) {
      xbits = extra[n - base];
    }
    f = tree[n]._freq;
    s._opt_len += f * (bits + xbits);
    if (stree) {
      s._static_len += f * (stree[n]._len + xbits);
    }
  }
  if (overflow == 0) {
    return;
  }

  do {
    bits = max_length - 1;
    while (s._bl_count[bits] == 0) {
      bits--;
    }
    s._bl_count[bits]--;
    s._bl_count[bits + 1] += 2;
    s._bl_count[max_length]--;
    overflow -= 2;
  } while (overflow > 0);

  for (bits = max_length; bits != 0; bits--) {
    n = s._bl_count[bits];
    while (n != 0) {
      m = s._heap[--h];
      if (m > max_code) {
        continue;
      }
      if (tree[m]._len != bits) {
        s._opt_len += (bits - tree[m]._len) * tree[m]._freq;
        tree[m]._len = bits;
      }
      n--;
    }
  }
}

export function build_tree(s: DeflateState, desc: TreeDescription): void {
  const tree: ReadonlyArray<HuffmanTreeNode> = desc._dyn_tree;
  const stree = desc._stat_desc._static_tree;
  const elems = desc._stat_desc._elems;
  let n, m;
  let max_code = -1;
  let node;

  s._heap_len = 0;
  s._heap_max = HEAP_SIZE;
  for (n = 0; n < elems; n++) {
    if (tree[n]._freq != 0) {
      s._heap[++s._heap_len] = max_code = n;
      s._depth[n] = 0;
    } else {
      tree[n]._len = 0;
    }
  }

  while (s._heap_len < 2) {
    node = s._heap[++s._heap_len] = max_code < 2 ? ++max_code : 0;
    tree[node]._freq = 1;
    s._depth[node] = 0;
    s._opt_len--;
    if (stree) {
      s._static_len -= stree[node]._len;
    }
  }
  desc._max_code = max_code;

  for (n = Math.floor(s._heap_len / 2); n >= 1; n--) {
    pqdownheap(s, tree, n);
  }

  node = elems;
  do {
    n = pqremove(s, tree, n);
    m = s._heap[SMALLEST];

    s._heap[--s._heap_max] = n;
    s._heap[--s._heap_max] = m;

    tree[node]._freq = tree[n]._freq + tree[m]._freq;
    s._depth[node] = (s._depth[n] >= s._depth[m] ? s._depth[n] : s._depth[m]) + 1;
    tree[n]._dad = tree[m]._dad = node;

    s._heap[SMALLEST] = node++;
    pqdownheap(s, tree, SMALLEST);
  } while (s._heap_len >= 2);

  s._heap[--s._heap_max] = s._heap[SMALLEST];

  gen_bitlen(s, desc);

  gen_codes(tree, desc._max_code, s._bl_count);
}

export function scan_tree(s: DeflateState, tree: HuffmanTreeNode[], max_code: number): void {
  let n;
  let prevlen = -1;
  let curlen;
  let nextlen = tree[0]._len;
  let count = 0;
  let max_count = 7;
  let min_count = 4;

  if (nextlen == 0) {
    max_count = 138;
    min_count = 3;
  }
  tree[max_code + 1]._len = 0xffff;

  for (n = 0; n <= max_code; n++) {
    curlen = nextlen;
    nextlen = tree[n + 1]._len;
    if (++count < max_count && curlen == nextlen) {
      continue;
    } else if (count < min_count) {
      s._bl_tree[curlen]._freq += count;
    } else if (curlen != 0) {
      if (curlen != prevlen) {
        s._bl_tree[curlen]._freq++;
      }
      s._bl_tree[REP_3_6]._freq++;
    } else if (count <= 10) {
      s._bl_tree[REPZ_3_10]._freq++;
    } else {
      s._bl_tree[REPZ_11_138]._freq++;
    }
    count = 0;
    prevlen = curlen;
    if (nextlen == 0) {
      max_count = 138;
      min_count = 3;
    } else if (curlen == nextlen) {
      max_count = 6;
      min_count = 3;
    } else {
      max_count = 7;
      min_count = 4;
    }
  }
}

export function send_tree(s: DeflateState, tree: HuffmanTreeNode[], max_code: number): void {
  let prevlen = -1;
  let curlen;
  let nextlen = tree[0]._len;
  let count = 0;
  let max_count = 7;
  let min_count = 4;

  if (nextlen == 0) {
    max_count = 138;
    min_count = 3;
  }
  for (let n = 0; n <= max_code; n++) {
    curlen = nextlen;
    nextlen = tree[n + 1]._len;
    if (++count < max_count && curlen == nextlen) {
      continue;
    } else if (count < min_count) {
      do {
        send_bits(s, s._bl_tree[curlen]._code, s._bl_tree[curlen]._len);
      } while (--count != 0);
    } else if (curlen != 0) {
      if (curlen != prevlen) {
        send_bits(s, s._bl_tree[curlen]._code, s._bl_tree[curlen]._len);
        count--;
      }

      send_bits(s, s._bl_tree[REP_3_6]._code, s._bl_tree[REP_3_6]._len);
      send_bits(s, count - 3, 2);
    } else if (count <= 10) {
      send_bits(s, s._bl_tree[REPZ_3_10]._code, s._bl_tree[REPZ_3_10]._len);
      send_bits(s, count - 3, 3);
    } else {
      send_bits(s, s._bl_tree[REPZ_11_138]._code, s._bl_tree[REPZ_11_138]._len);
      send_bits(s, count - 11, 7);
    }
    count = 0;
    prevlen = curlen;
    if (nextlen == 0) {
      max_count = 138;
      min_count = 3;
    } else if (curlen == nextlen) {
      max_count = 6;
      min_count = 3;
    } else {
      max_count = 7;
      min_count = 4;
    }
  }
}

export function build_bl_tree(s: DeflateState): number {
  scan_tree(s, s._dyn_ltree, s._l_desc._max_code);
  scan_tree(s, s._dyn_dtree, s._d_desc._max_code);

  build_tree(s, s._bl_desc);

  let max_blindex;
  for (max_blindex = BL_CODES - 1; max_blindex >= 3; max_blindex--) {
    if (s._bl_tree[BL_ORDER[max_blindex]]._len != 0) {
      break;
    }
  }

  s._opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4;

  return max_blindex;
}

export function send_all_trees(s: DeflateState, lcodes: number, dcodes: number, blcodes: number): void {
  let rank;

  send_bits(s, lcodes - 257, 5);
  send_bits(s, dcodes - 1, 5);
  send_bits(s, blcodes - 4, 4);
  for (rank = 0; rank < blcodes; rank++) {
    send_bits(s, s._bl_tree[BL_ORDER[rank]]._len, 3);
  }

  send_tree(s, s._dyn_ltree, lcodes - 1);

  send_tree(s, s._dyn_dtree, dcodes - 1);
}

export function _tr_stored_block(
  s: DeflateState,
  buf: Uint8Array | null,
  stored_len: number,
  last: number,
  bufIndex: number = 0,
): void {
  send_bits(s, (STORED_BLOCK << 1) + last, 3);
  bi_windup(s);
  put_short(s, stored_len);
  put_short(s, ~stored_len);
  if (stored_len && buf) {
    zmemcpy(s._pending_buffer, s._pending, buf, bufIndex, stored_len);
  }
  s._pending += stored_len;
}

export function _tr_flush_bits(s: DeflateState): void {
  bi_flush(s);
}

export function _tr_align(s: DeflateState): void {
  send_bits(s, STATIC_TREES << 1, 3);
  send_bits(s, STATIC_LTREE[END_BLOCK]._code, STATIC_LTREE[END_BLOCK]._len);
  bi_flush(s);
}

export function compress_block(
  s: DeflateState,
  ltree: ReadonlyArray<HuffmanTreeNode>,
  dtree: ReadonlyArray<HuffmanTreeNode>,
): void {
  let dist;
  let lc;
  let sx = 0;
  let code;
  let extra;

  if (s._sym_next != 0) {
    do {
      let b0 = s._sym_buf[sx];
      let b1 = s._sym_buf[sx + 1];
      let b2 = s._sym_buf[sx + 2];
      dist = b0 & 0xff;
      dist += (b1 & 0xff) << 8;
      lc = b2;
      sx += 3;
      if (dist == 0) {
        send_bits(s, ltree[lc]._code, ltree[lc]._len);
      } else {
        code = LENGTH_CODE[lc];
        send_bits(s, ltree[code + LITERALS + 1]._code, ltree[code + LITERALS + 1]._len);
        extra = EXTRA_LBITS[code];
        if (extra != 0) {
          lc -= BASE_LENGTH[code];
          send_bits(s, lc, extra);
        }
        dist--;
        code = d_code(dist);

        send_bits(s, dtree[code]._code, dtree[code]._len);
        extra = EXTRA_DBITS[code];
        if (extra != 0) {
          dist -= BASE_DIST[code];
          send_bits(s, dist, extra);
        }
      }
    } while (sx < s._sym_next);
  }

  send_bits(s, ltree[END_BLOCK]._code, ltree[END_BLOCK]._len);
}

export function detect_data_type(s: DeflateState): number {
  let block_mask = 0xf3ffc07f;
  let n;

  for (n = 0; n <= 31; n++, block_mask >>= 1) {
    if (block_mask & 1 && s._dyn_ltree[n]._freq != 0) {
      return Z_BINARY;
    }
  }

  if (s._dyn_ltree[9]._freq != 0 || s._dyn_ltree[10]._freq != 0 || s._dyn_ltree[13]._freq != 0) {
    return Z_TEXT;
  }
  for (n = 32; n < LITERALS; n++) {
    if (s._dyn_ltree[n]._freq != 0) {
      return Z_TEXT;
    }
  }

  return Z_BINARY;
}

export function _tr_flush_block(
  s: DeflateState,
  buf: Uint8Array | null,
  stored_len: number,
  last: number,
  bufIndex: number = 0,
): void {
  let opt_lenb, static_lenb;
  let max_blindex = 0;

  if (s._level > 0) {
    if (s._strm._data_type == Z_UNKNOWN) {
      s._strm._data_type = detect_data_type(s);
    }

    build_tree(s, s._l_desc);
    build_tree(s, s._d_desc);

    max_blindex = build_bl_tree(s);

    opt_lenb = (s._opt_len + 3 + 7) >> 3;
    static_lenb = (s._static_len + 3 + 7) >> 3;

    if (static_lenb <= opt_lenb || s._strategy == Z_FIXED) {
      opt_lenb = static_lenb;
    }
  } else {
    opt_lenb = static_lenb = stored_len + 5;
  }

  if (stored_len + 4 <= opt_lenb && buf) {
    _tr_stored_block(s, buf, stored_len, last, bufIndex);
  } else if (static_lenb == opt_lenb) {
    send_bits(s, (STATIC_TREES << 1) + last, 3);
    compress_block(s, STATIC_LTREE, STATIC_DTREE);
  } else {
    send_bits(s, (DYN_TREES << 1) + last, 3);
    send_all_trees(s, s._l_desc._max_code + 1, s._d_desc._max_code + 1, max_blindex + 1);
    compress_block(s, s._dyn_ltree, s._dyn_dtree);
  }

  init_block(s);

  if (last) {
    bi_windup(s);
  }
}
