export const ENOUGH_LENS = 852;
export const ENOUGH_DISTS = 592;
export const ENOUGH_DISTS_9 = 594;

export const LBASE = new Uint16Array([
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 0,
  0,
]);

export const LEXT: Uint16Array = fillData([16, 8, 17, 4, 18, 4, 19, 4, 20, 4, 21, 4, 16, 1, 73, 1, 200, 1]);

export const DBASE = new Uint16Array([
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
  8193, 12289, 16385, 24577, 0, 0,
]);

export const DEXT: Uint16Array = fillData([
  16, 4, 17, 2, 18, 2, 19, 2, 20, 2, 21, 2, 22, 2, 23, 2, 24, 2, 25, 2, 26, 2, 27, 2, 28, 2, 29, 2, 64, 2,
]);

export const LBASE_9 = new Uint16Array([
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 3, 0, 0,
]);

export const LEXT_9: Uint16Array = fillData([128, 8, 129, 4, 130, 4, 131, 4, 132, 4, 133, 4, 16, 1, 73, 1, 200, 1]);

export const DBASE_9 = new Uint16Array([
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
  8193, 12289, 16385, 24577, 32769, 49153,
]);

export const DEXT_9: Uint16Array = fillData([
  128, 4, 129, 2, 130, 2, 131, 2, 132, 2, 133, 2, 134, 2, 135, 2, 136, 2, 137, 2, 138, 2, 139, 2, 140, 2, 141, 2, 142,
  2,
]);

function fillData(data: number[]): Uint16Array {
  const arr: number[] = [];
  for (let i = 0; i < data.length; i += 2) {
    const value = data[i];
    const count = data[i + 1];
    for (let i = 0; i < count; i++) {
      arr.push(value);
    }
  }
  return new Uint16Array(arr);
}
