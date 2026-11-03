// Readers of the new-game data (spec 024, research R1/R3). sLocation_PlayerRoom (location_backup.c)
// is a Location of five u32: mapId, warpId (0xFFFFFFFF = a free position), x, y, direction. The
// GetStdMsgNaix table (ov01_022067C8) is a u16 list of message banks. Found and checked in the US ROM.
import type { NewGameFile, StdMessagesFile } from "@soulsilver/shared/events";
import { readU16, readU32 } from "../binary.ts";

const FREE_POSITION = 0xffffffff;
/** The original's direction order (DIR_NORTH 0, DIR_SOUTH 1, DIR_WEST 2, DIR_EAST 3). */
const FACING = ["north", "south", "west", "east"] as const;

export function readNewGameStart(arm9: Uint8Array, offset: number): Pick<NewGameFile, "map" | "tx" | "ty" | "facing"> {
  if (offset + 20 > arm9.length) throw new Error(`posição inicial: 0x${offset.toString(16)} fora da ARM9`);
  const [map, warp, tx, ty, dir] = [0, 4, 8, 12, 16].map((k) => readU32(arm9, offset + k)) as [number, number, number, number, number];
  if (warp !== FREE_POSITION) throw new Error(`posição inicial: warpId ${warp}, esperado 0xFFFFFFFF`);
  const facing = FACING[dir];
  if (!facing) throw new Error(`posição inicial: direção ${dir} inválida`);
  return { map, tx, ty, facing };
}

export function readStdMessageBanks(overlay1: Uint8Array, table: { offset: number; count: number }): StdMessagesFile["banks"] {
  if (table.offset + table.count * 2 > overlay1.length) throw new Error(`tabela de mensagens padrão: 0x${table.offset.toString(16)} fora do overlay 1`);
  return Array.from({ length: table.count }, (_, i) => readU16(overlay1, table.offset + i * 2));
}
