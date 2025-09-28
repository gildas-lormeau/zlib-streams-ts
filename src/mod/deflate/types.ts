import type { DeflateState } from "../common/types";

export interface DeflateConfig {
  func: CompressFunction;
  max_lazy: number;
  good_length: number;
  nice_length: number;
  max_chain: number;
}

export enum BlockState {
  NEED_MORE = 0,
  BLOCK_DONE = 1,
  FINISH_STARTED = 2,
  FINISH_DONE = 3,
}

export type InflatePos = number;

export type CompressFunction = (s: DeflateState, flush: number) => BlockState;
