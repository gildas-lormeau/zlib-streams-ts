export interface Stream {
  _state: DeflateState | InflateState | undefined;
  next_in: Uint8Array;
  next_in_index: number;
  avail_in: number;
  total_in: number;
  next_out: Uint8Array;
  next_out_index: number;
  avail_out: number;
  total_out: number;
  msg: string;
  _adler: number;
  _data_type: number;
  _reserved: number;
}

export interface DeflateStream extends Stream {
  _state: DeflateState;
}

export interface InflateStream extends Stream {
  _state: InflateState;
}

export interface State {
  _strm: InflateStream | DeflateStream;
  _window: Uint8Array;
  _gzhead?: GzipHeader;
  _w_size: number;
  _w_bits: number;
  _w_have: number;
  _wrap: number;
  _bit_buffer: number;
  _bit_count: number;
}

export interface DeflateState extends State {
  _strm: DeflateStream;
  _status: DeflateStatus;
  _pending_buffer: Uint8Array;
  _pending_buffer_index: number;
  _pending_bit_buffer_size: number;
  _pending: number;
  _pending_out_index: number;
  _gzindex: number;
  _method: number;
  _last_flush: number;
  _w_mask: number;
  _window_buffer_size: number;
  _prev: Uint16Array;
  _head: Uint16Array;
  _ins_h: number;
  _hash_size: number;
  _hash_bits: number;
  _hash_mask: number;
  _hash_shift: number;
  _block_start: number;
  _match_length: number;
  _prev_match: number;
  _match_available: number;
  _strstart: number;
  _match_start: number;
  _lookahead: number;
  _prev_length: number;
  _max_chain_length: number;
  _max_lazy_match: number;
  _level: number;
  _strategy: number;
  _good_match: number;
  _nice_match: number;
  _dyn_ltree: HuffmanTreeNode[];
  _dyn_dtree: HuffmanTreeNode[];
  _bl_tree: HuffmanTreeNode[];
  _l_desc: TreeDescription;
  _d_desc: TreeDescription;
  _bl_desc: TreeDescription;
  _bl_count: Uint16Array;
  _heap: Int32Array;
  _heap_len: number;
  _heap_max: number;
  _depth: Uint8Array;
  _opt_len: number;
  _static_len: number;
  _sym_buf: Uint8Array;
  _sym_next: number;
  _sym_end: number;
  _sym_buf_index: number;
  _bit_used: number;
  _insert: number;
  _lit_bufsize: number;
  _matches: number;
}

export interface InflateState extends State {
  _strm: InflateStream;
  _mode: InflateMode;
  _last: boolean;
  _havedict: boolean;
  _flags: number;
  _dmax: number;
  _check: number;
  _total: number;
  _w_next: number;
  _length: number;
  _offset: number;
  _extra: number;
  _lencode: HuffmanCode[];
  _distcode: HuffmanCode[];
  _lenbits: number;
  _distbits: number;
  _ncode: number;
  _nlen: number;
  _ndist: number;
  _have: number;
  _next: HuffmanCode[];
  _lens: Uint16Array;
  _work: Uint16Array;
  _codes: HuffmanCode[];
  _next_index: number;
  _sane: boolean;
  _back: number;
  _was: number;
  _deflate64: boolean;
}

export enum DeflateStatus {
  INIT_STATE = 42,
  BUSY_STATE = 113,
  EXTRA_STATE = 69,
  NAME_STATE = 73,
  COMMENT_STATE = 91,
  HCRC_STATE = 103,
  FINISH_STATE = 666,
  GZIP_STATE = 57,
}

export interface GzipHeader {
  _text: number;
  _time: number;
  _xflags: number;
  _os: number;
  _extra: Uint8Array;
  _extra_max?: number;
  _extra_len: number;
  _name: Uint8Array;
  _name_max?: number;
  _comment: Uint8Array;
  _comm_max?: number;
  _hcrc: number;
  _done: number;
}

export class TreeDescription {
  _dyn_tree: ReadonlyArray<HuffmanTreeNode>;
  _stat_desc: StaticTreeDescription;
  _max_code: number;

  constructor(dyn_tree: ReadonlyArray<HuffmanTreeNode>, stat_desc: StaticTreeDescription) {
    this._dyn_tree = dyn_tree;
    this._stat_desc = stat_desc;
    this._max_code = 0;
  }
}

export enum InflateMode {
  HEAD = 16180,
  FLAGS,
  TIME,
  OS,
  EXLEN,
  EXTRA,
  NAME,
  COMMENT,
  HCRC,
  DICTID,
  DICT,
  TYPE,
  TYPEDO,
  STORED,
  COPY_,
  COPY,
  TABLE,
  LENLENS,
  CODELENS,
  LEN_,
  LEN,
  LENEXT,
  DIST,
  DISTEXT,
  MATCH,
  LIT,
  CHECK,
  LENGTH,
  DONE,
  BAD,
  MEM,
  SYNC,
}

export class StaticTreeDescription {
  readonly _static_tree: ReadonlyArray<HuffmanTreeNode> | null;
  readonly _extra_bits: ArrayLike<number>;
  readonly _extra_base: number;
  readonly _elems: number;
  readonly _max_length: number;

  constructor(
    static_tree: ReadonlyArray<HuffmanTreeNode> | null,
    extra_bits: ArrayLike<number>,
    extra_base: number,
    elems: number,
    max_length: number,
  ) {
    this._static_tree = static_tree;
    this._extra_bits = extra_bits;
    this._extra_base = extra_base;
    this._elems = elems;
    this._max_length = max_length;
  }
}

export interface HuffmanCode {
  _op: number;
  _bits: number;
  _val: number;
}

export type HuffmanTreeNode = { _freq: number; _code: number; _dad: number; _len: number };

export enum CodeType {
  CODES = 0,
  LENS = 1,
  DISTS = 2,
}
