import { BASE_DIST, BASE_LENGTH, EXTRA_LBITS_DATA, EXTRA_DBITS_DATA } from "../common/constants";
import { fillData } from "../common/utils";

export const ENOUGH_LENS = 852;
export const ENOUGH_DISTS = 592;
export const ENOUGH_DISTS_9 = 594;

const DBASE_COMMON_DATA = BASE_DIST.map((value) => value + 1);
const LBASE_COMMON_DATA = BASE_LENGTH.subarray(0, -1).map((value) => value + 3);

const LEXT_COMMON_END_DATA = [16, 1, 73, 1, 200, 1];

const DEXT_DATA = EXTRA_DBITS_DATA.map(mapExtValue);
const DEXT_DATA_9 = EXTRA_DBITS_DATA.map(mapExt9Value);
DEXT_DATA.push(64, 2);
DEXT_DATA_9.push(142, 2);

const LEXT_DATA = EXTRA_LBITS_DATA.map(mapExtValue);
const LEXT_DATA_9 = EXTRA_LBITS_DATA.map(mapExt9Value);
LEXT_DATA.push(...LEXT_COMMON_END_DATA);
LEXT_DATA_9.push(...LEXT_COMMON_END_DATA);

export const LBASE = new Uint16Array([...LBASE_COMMON_DATA, 258, 0, 0]);

export const LEXT: Uint16Array = fillData(LEXT_DATA);

export const DBASE = new Uint16Array([...DBASE_COMMON_DATA, 0, 0]);

export const DEXT: Uint16Array = fillData(DEXT_DATA);

export const LBASE_9 = new Uint16Array([...LBASE_COMMON_DATA, 3, 0, 0]);

export const LEXT_9: Uint16Array = fillData(LEXT_DATA_9);

export const DBASE_9 = new Uint16Array([...DBASE_COMMON_DATA, 32769, 49153]);

export const DEXT_9: Uint16Array = fillData(DEXT_DATA_9);

function mapExtValue(value: number, index: number): number {
  return index % 2 ? value : value + 16;
}

function mapExt9Value(value: number, index: number): number {
  return index % 2 ? value : value + 128;
}
