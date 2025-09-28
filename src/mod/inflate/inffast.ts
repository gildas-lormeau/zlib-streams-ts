import type { InflateStream, HuffmanCode } from "../common/types";

import { InflateMode } from "../common/types";

export function inflate_fast(strm: InflateStream, start: number): void {
  const state = strm._state;
  let inIndex = strm.next_in_index;
  let outIndex = strm.next_out_index;
  const input = strm.next_in;
  const output = strm.next_out;
  const window = state._window;
  let hold = state._bit_buffer >>> 0;
  let bits = state._bit_count >>> 0;
  const lcode = state._lencode;
  const dcode = state._distcode;
  const lmask = (1 << state._lenbits) - 1;
  const dmask = (1 << state._distbits) - 1;
  const w_size = state._w_size >>> 0;
  const w_have = state._w_have >>> 0;
  const w_next = state._w_next >>> 0;
  const sane = state._sane;
  const beg = outIndex - (start - strm.avail_out);
  const end = outIndex + (strm.avail_out - 257);
  const last = inIndex + (strm.avail_in - 5);

  let len = 0,
    dist = 0,
    op = 0;
  let from_index = 0;
  let here: HuffmanCode;

  main_loop: do {
    while (bits < 15) {
      if (inIndex < input.length) {
        hold += input[inIndex++] << bits;
        bits += 8;
      } else {
        break main_loop;
      }
    }
    here = lcode[hold & lmask];
    dolen: while (true) {
      op = here._bits;
      hold >>>= op;
      bits -= op;
      op = here._op;
      if (op == 0) {
        output[outIndex++] = here._val;
        break;
      } else if (op & 16) {
        len = here._val;
        op &= 15;
        if (op) {
          while (bits < op) {
            if (inIndex < input.length) {
              hold += input[inIndex++] << bits;
              bits += 8;
            } else {
              state._mode = InflateMode.LEN;
              break main_loop;
            }
          }
          len += hold & ((1 << op) - 1);
          hold >>>= op;
          bits -= op;
        }

        while (bits < 15) {
          if (inIndex < input.length) {
            hold += input[inIndex++] << bits;
            bits += 8;
          } else {
            state._mode = InflateMode.LEN;
            break main_loop;
          }
        }
        here = dcode[hold & dmask];
        dodist: while (true) {
          op = here._bits;
          hold >>>= op;
          bits -= op;
          op = here._op;
          if (op & 16) {
            dist = here._val;
            op &= 15;
            if (op) {
              while (bits < op) {
                if (inIndex < input.length) {
                  hold += input[inIndex++] << bits;
                  bits += 8;
                } else {
                  state._mode = InflateMode.LEN;
                  break main_loop;
                }
              }
              dist += hold & ((1 << op) - 1);
              hold >>>= op;
              bits -= op;
            }

            let copyLen = len;
            let outMaxDist = outIndex - beg;
            if (dist > outMaxDist) {
              let op2 = dist - outMaxDist;
              if (op2 > w_have) {
                if (sane) {
                  strm.msg = "invalid distance too far back";
                  state._mode = InflateMode.BAD;
                  break main_loop;
                }
              }
              if (w_next == 0) {
                from_index = w_size - op2;
                if (op2 < copyLen) {
                  for (let i = 0; i < op2; ++i) {
                    output[outIndex++] = window[from_index++];
                  }
                  copyLen -= op2;
                  from_index = outIndex - dist;
                } else {
                  for (let i = 0; i < copyLen; ++i) {
                    output[outIndex++] = window[from_index++];
                  }
                  continue main_loop;
                }
              } else if (w_next < op2) {
                from_index = w_size + w_next - op2;
                let op3 = op2 - w_next;
                if (op3 < copyLen) {
                  for (let i = 0; i < op3; ++i) {
                    output[outIndex++] = window[from_index++];
                  }
                  copyLen -= op3;
                  from_index = 0;
                  if (w_next < copyLen) {
                    for (let i = 0; i < w_next; ++i) {
                      output[outIndex++] = window[from_index++];
                    }
                    copyLen -= w_next;
                    from_index = outIndex - dist;
                  }
                } else {
                  for (let i = 0; i < copyLen; ++i) {
                    output[outIndex++] = window[from_index++];
                  }
                  continue main_loop;
                }
              } else {
                from_index = w_next - op2;
                if (op2 < copyLen) {
                  for (let i = 0; i < op2; ++i) {
                    output[outIndex++] = window[from_index++];
                  }
                  copyLen -= op2;
                  from_index = outIndex - dist;
                } else {
                  for (let i = 0; i < copyLen; ++i) {
                    output[outIndex++] = window[from_index++];
                  }
                  continue main_loop;
                }
              }

              while (copyLen > 2) {
                output[outIndex++] = output[from_index++];
                output[outIndex++] = output[from_index++];
                output[outIndex++] = output[from_index++];
                copyLen -= 3;
              }
              if (copyLen) {
                output[outIndex++] = output[from_index++];
                if (copyLen > 1) {
                  output[outIndex++] = output[from_index++];
                }
              }
            } else {
              from_index = outIndex - dist;
              while (copyLen > 2) {
                output[outIndex++] = output[from_index++];
                output[outIndex++] = output[from_index++];
                output[outIndex++] = output[from_index++];
                copyLen -= 3;
              }
              if (copyLen) {
                output[outIndex++] = output[from_index++];
                if (copyLen > 1) {
                  output[outIndex++] = output[from_index++];
                }
              }
            }
            break;
          } else if ((op & 64) == 0) {
            here = dcode[here._val + (hold & ((1 << op) - 1))];
            continue dodist;
          } else {
            strm.msg = "invalid distance code";
            state._mode = InflateMode.BAD;
            break main_loop;
          }
        }
        break;
      } else if ((op & 64) == 0) {
        here = lcode[here._val + (hold & ((1 << op) - 1))];
        continue dolen;
      } else if (op & 32) {
        state._mode = InflateMode.TYPE;
        break main_loop;
      } else {
        strm.msg = "invalid literal/length code";
        state._mode = InflateMode.BAD;
        break main_loop;
      }
    }
  } while (inIndex < last && outIndex < end);

  let used = bits >> 3;
  inIndex -= used;
  bits -= used << 3;
  hold &= (1 << bits) - 1;

  strm.next_in_index = inIndex;
  strm.next_out_index = outIndex;
  strm.avail_in = inIndex < last ? 5 + (last - inIndex) : 5 - (inIndex - last);
  strm.avail_out = outIndex < end ? 257 + (end - outIndex) : 257 - (outIndex - end);
  state._bit_buffer = hold >>> 0;
  state._bit_count = bits >>> 0;
}
