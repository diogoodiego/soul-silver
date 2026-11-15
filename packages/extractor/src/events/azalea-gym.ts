// Reader of the Azalea Gym's Spinarak threads (spec 030.5) in overlay 4: the stops (u16 x, u16 z), then
// one pointer per stop to four 8-byte records, one per lever state: u16 point count, u16 destination
// stop, u32 pointer to the thread's points (u16 x, u16 z). Found and checked in the US ROM; a thread
// is listed once and both of its stops point at it.
import type { AzaleaGymFile } from "@soulsilver/shared/events";
import { PIECE_TILES } from "@soulsilver/shared/maps";
import { readU16, readU32 } from "../binary.ts";
import { TILE_UNITS, type Piece } from "../maps/piece.ts";

const LEVER_STATES = 4;
const RECORD_BYTES = 8;

type Layout = { base: number; stations: number; routes: number; count: number; spiders: readonly number[] };

export function readAzaleaGym(overlay: Uint8Array, layout: Layout): Omit<AzaleaGymFile, "kind" | "formatVersion" | "levers"> {
  const fail = (problem: string): never => {
    throw new Error(`ginásio de Azalea: ${problem}`);
  };
  const at = (pointer: number, bytes: number) => {
    const offset = pointer - layout.base;
    if (offset < 0 || offset + bytes > overlay.length) fail(`ponteiro 0x${pointer.toString(16)} fora do overlay`);
    return offset;
  };
  if (layout.stations + layout.count * 4 > overlay.length || layout.routes + layout.count * 4 > overlay.length) fail("tabela fora do overlay");
  const point = (o: number) => ({ x: readU16(overlay, o), z: readU16(overlay, o + 2) });
  const stations = Array.from({ length: layout.count }, (_, i) => point(layout.stations + i * 4));
  const routes = stations.map((_, i) => {
    const block = at(readU32(overlay, layout.routes + i * 4), LEVER_STATES * RECORD_BYTES);
    return Array.from({ length: LEVER_STATES }, (_, state) => {
      const o = block + state * RECORD_BYTES;
      const count = readU16(overlay, o);
      const to = readU16(overlay, o + 2);
      if (count === 0) return null;
      if (to >= layout.count) fail(`a parada ${i} leva à parada ${to}, que não existe`);
      const points = at(readU32(overlay, o + 4), count * 4);
      return { to, path: Array.from({ length: count }, (_, k) => point(points + k * 4)) };
    });
  });
  return { stations, routes, spiders: [...layout.spiders] };
}

/** A piece's buildings are placed from its center; a piece is PIECE_TILES tiles of TILE_UNITS (pixels) a side. */
const PIECE_PX = PIECE_TILES * TILE_UNITS;

/** The gym's ropes and levers: the buildings of `models` (model -> the lever that moves it) in the map's cells, in map pixels. */
export function gymLevers(cells: { x: number; z: number; piece: Pick<Piece, "buildings"> }[], models: Readonly<Record<number, number>>): AzaleaGymFile["levers"] {
  return cells.flatMap((cell) =>
    cell.piece.buildings.flatMap((b) => {
      const lever = models[b.model];
      if (lever === undefined) return [];
      return [{ model: b.model, lever, x: cell.x * PIECE_PX + PIECE_PX / 2 + b.position[0], y: b.position[1], z: cell.z * PIECE_PX + PIECE_PX / 2 + b.position[2] }];
    }),
  );
}
