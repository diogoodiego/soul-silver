import { EVOLUTION_METHODS, type EvolutionCondition, type EvolutionMethodKey } from "@soulsilver/shared/game-data";
import { readU16 } from "../../binary.ts";

// Evolution record, 44 bytes; see specs/004-game-data-extraction/research.md R6.

const RECORD_SIZE = 44;
const ENTRIES = 7;

const LEVEL = new Set([4, 8, 9, 10, 11, 12, 13, 14, 22, 23]);
const ITEM = new Set([6, 7, 16, 17, 18, 19]);
const NONE = new Set([1, 2, 3, 5, 24, 25, 26]);

function condition(methodId: number, parameter: number): EvolutionCondition {
  if (LEVEL.has(methodId)) return { kind: "level", level: parameter };
  if (ITEM.has(methodId)) return { kind: "item", item: parameter };
  if (methodId === 20) return { kind: "move", move: parameter };
  if (methodId === 21) return { kind: "species", species: parameter };
  if (methodId === 15) return { kind: "beauty", minimum: parameter };
  if (NONE.has(methodId)) return { kind: "none" };
  return { kind: "raw", value: parameter };
}

export interface Evolution {
  method: EvolutionMethodKey;
  methodId: number;
  parameter: number;
  condition: EvolutionCondition;
  into: number;
}

/** Up to seven entries; empty ones (method 0) are omitted and the order is kept. */
export function readEvolutions(bytes: Uint8Array): Evolution[] {
  if (bytes.length < RECORD_SIZE) throw new Error(`Registro de evolução com ${bytes.length} bytes (esperado ${RECORD_SIZE})`);
  const entries: Evolution[] = [];
  for (let k = 0; k < ENTRIES; k++) {
    const methodId = readU16(bytes, k * 6);
    if (methodId === 0) continue;
    const parameter = readU16(bytes, k * 6 + 2);
    const known = (EVOLUTION_METHODS as Record<number, EvolutionMethodKey>)[methodId];
    entries.push({
      method: known ?? "unknown",
      methodId,
      parameter,
      condition: condition(methodId, parameter),
      into: readU16(bytes, k * 6 + 4),
    });
  }
  return entries;
}
