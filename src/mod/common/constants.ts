export const WINDOW_BITS = 15;
export const DEFLATE64_WINDOW_BITS = 16;
export const WINDOW_SIZE = 1 << WINDOW_BITS;
export const DEFLATE64_WINDOW_SIZE = 1 << DEFLATE64_WINDOW_BITS;
export const GZIP_WRAPPER_OFFSET = 16;

export const DEF_WBITS = 15;
export const BYTE_BITS = 8;
export const W_SIZE = 1 << DEF_WBITS;
export const W_BITS = DEF_WBITS;
export const W_MASK = (1 << W_BITS) - 1;

export const Z_NO_FLUSH = 0;
export const Z_PARTIAL_FLUSH = 1;
export const Z_SYNC_FLUSH = 2;
export const Z_FULL_FLUSH = 3;
export const Z_FINISH = 4;
export const Z_BLOCK = 5;
export const Z_TREES = 6;

export const Z_OK = 0;
export const Z_STREAM_END = 1;
export const Z_NEED_DICT = 2;
export const Z_ERRNO = -1;
export const Z_STREAM_ERROR = -2;
export const Z_DATA_ERROR = -3;
export const Z_MEM_ERROR = -4;
export const Z_BUF_ERROR = -5;
export const Z_VERSION_ERROR = -6;

export const Z_NO_COMPRESSION = 0;
export const Z_BEST_SPEED = 1;
export const Z_BEST_COMPRESSION = 9;
export const Z_DEFAULT_COMPRESSION = -1;

export const Z_FILTERED = 1;
export const Z_HUFFMAN_ONLY = 2;
export const Z_RLE = 3;
export const Z_FIXED = 4;
export const Z_DEFAULT_STRATEGY = 0;

export const Z_BINARY = 0;
export const Z_TEXT = 1;
export const Z_UNKNOWN = 2;

export const Z_DEFLATED = 8;

export const BL_ORDER: ReadonlyArray<number> = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
export const EMPTY_UINT8 = new Uint8Array(0);
export const EMPTY_UINT16 = new Uint16Array(0);
export const EMPTY_HUFFMAN: ReadonlyArray<any> = [];

export const EXTRA_LBITS_DATA: number[] = [];
for (let index = 0; index < 6; index++) {
  EXTRA_LBITS_DATA.push(index, index == 0 ? 8 : 4);
}
EXTRA_LBITS_DATA.push(0, 1);

export const EXTRA_DBITS_DATA: number[] = [];
for (let index = 0; index < 14; index++) {
  EXTRA_DBITS_DATA.push(index, index == 0 ? 4 : 2);
}

export const BASE_DIST: Uint16Array = new Uint16Array([
  0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 6144,
  8192, 12288, 16384, 24576,
]);

export const BASE_LENGTH: Uint16Array = new Uint16Array([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 0,
]);
