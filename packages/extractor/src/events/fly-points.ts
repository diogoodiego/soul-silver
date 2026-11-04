// Reader of the Fly destinations (spec 025, research R1): sSpawnMaps in ARM9 (unk_0203BA5C.s), a table
// of 18-byte records. GetFlyWarpData reads the map and tile at +6, +8 and +10. Found and checked in
// the US ROM; the tile is in the original's own coordinates (the matrix's, as new-game.json has).
import type { FlyPointsFile } from "@soulsilver/shared/events";
import { readU16 } from "../binary.ts";

const RECORD_BYTES = 18;
const IS_FLY_POINT = 0x200;
const MAX_FLYPOINT = 37;

export function readFlyPoints(arm9: Uint8Array, table: { offset: number; count: number }): FlyPointsFile["points"] {
  if (table.offset + table.count * RECORD_BYTES > arm9.length) throw new Error(`pontos de voo: tabela 0x${table.offset.toString(16)} fora da ARM9`);
  const points: FlyPointsFile["points"] = [];
  for (let i = 0; i < table.count; i++) {
    const at = table.offset + i * RECORD_BYTES;
    const flags = readU16(arm9, at);
    if (!(flags & IS_FLY_POINT)) continue;
    const flypoint = flags & 0xff;
    if (flypoint > MAX_FLYPOINT) throw new Error(`pontos de voo: registro ${i} tem o ponto ${flypoint}, acima de ${MAX_FLYPOINT}`);
    points.push({ flypoint, map: readU16(arm9, at + 6), tx: readU16(arm9, at + 8), ty: readU16(arm9, at + 10) });
  }
  return points;
}
