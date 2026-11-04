import type { HeadbuttRecord } from "../events/schemas.ts";

// Which headbutt table a tree uses (pokeheartgold src/field/headbutt.c): regular trees are common,
// rare or nothing by the trainer id's last digit; secret trees always use the secret table.

export type TreeType = "common" | "rare" | "secret";

const C = "common";
const R = "rare";
const N = undefined;
type Cell = typeof C | typeof R | typeof N;

// sRareTreeLUT_1 … _5Plus, rows by the trainer id's last digit.
const LUT_1: Cell[][] = [[C], [R], [C], [R], [C], [R], [C], [R], [C], [R]];
const LUT_2: Cell[][] = [[C, R], [R, C], [C, R], [R, C], [C, R], [R, C], [C, R], [R, C], [C, R], [R, C]];
const LUT_3: Cell[][] = [[C, R, N], [C, N, R], [R, C, N], [R, N, C], [N, C, R], [N, R, C], [C, R, N], [C, N, R], [R, C, N], [R, N, C]];
const LUT_4: Cell[][] = [[N, C, C, R], [R, N, C, C], [R, R, N, C], [C, R, R, N], [C, C, R, R], [N, C, R, C], [R, N, C, R], [C, R, N, C], [R, C, R, N], [C, R, C, R]];
const LUT_5: Cell[][] = [[N, C, C, R, R], [R, N, C, C, R], [R, R, N, C, C], [C, R, R, N, C], [C, C, R, R, N], [N, C, R, C, R], [R, N, C, R, C], [C, R, N, C, R], [R, C, R, N, C], [C, R, C, R, N]];

function regular(which: number, count: number, trainerId: number): TreeType | undefined {
  const digit = trainerId % 10;
  if (count >= 5) return LUT_5[digit]![which % 5];
  return [LUT_1, LUT_2, LUT_3, LUT_4][count - 1]?.[digit]![which];
}

/** The table of the tree at matrix tile (x, z); undefined for a tree headbutt finds nothing in. */
export function headbuttTree(record: Pick<HeadbuttRecord, "regularTrees" | "secretTrees">, x: number, z: number, trainerId: number): TreeType | undefined {
  const at = (group: readonly (readonly [number, number])[]) => group.some(([tx, tz]) => tx === x && tz === z);
  const i = record.regularTrees.findIndex(at);
  if (i !== -1) return regular(i, record.regularTrees.length, trainerId);
  return record.secretTrees.some(at) ? "secret" : undefined;
}
