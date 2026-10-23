import {
  BATTLE_STAT_KEYS,
  GROWTH_RATE_KEYS,
  TYPE_KEYS,
  type GrowthRateRecord,
  type NatureRecord,
  type TypeChartRecord,
  type TypeRecord,
} from "@soulsilver/shared/game-data";
import { readU16 } from "../../binary.ts";

// Tables read from code and small lookups; see specs/004-game-data-extraction/research.md R8–R10.

const TYPE_COUNT = 18;
const NATURE_COUNT = 25;
const MAX_CHART_TRIPLES = 200;
const SEPARATOR = 0xfe;
const TERMINATOR = 0xff;

const hex = (value: number) => `0x${value.toString(16)}`;

type Tenths = TypeChartRecord["against"][number];

export interface TypeChartResult {
  records: TypeChartRecord[];
  foresightIgnored: Array<{ attacker: number; defender: number }>;
}

/**
 * Reads triples `(attacker, defender, tenths)` until the 0xFF terminator. Triples after the
 * 0xFE separator are still part of the matrix, and are also the pairs Foresight ignores.
 */
export function readTypeChart(code: Uint8Array, offset: number): TypeChartResult {
  const fail = (problem: string) => new Error(`Tabela de tipos em ${hex(offset)}: ${problem}`);
  const matrix = Array.from({ length: TYPE_COUNT }, () => Array.from<Tenths>({ length: TYPE_COUNT }).fill(10));
  const foresightIgnored: TypeChartResult["foresightIgnored"] = [];
  let afterSeparator = false;

  for (let n = 0; ; n++) {
    if (n >= MAX_CHART_TRIPLES) throw fail(`sem terminador em ${MAX_CHART_TRIPLES} triplas`);
    const base = offset + n * 3;
    if (base + 3 > code.length) throw fail("termina antes do terminador");
    const attacker = code[base]!;
    const defender = code[base + 1]!;
    const tenths = code[base + 2]!;
    if (attacker === TERMINATOR) break;
    if (attacker === SEPARATOR) {
      afterSeparator = true;
      continue;
    }
    if (attacker >= TYPE_COUNT || defender >= TYPE_COUNT) throw fail(`tipo fora de 0–${TYPE_COUNT - 1} (${attacker}, ${defender})`);
    if (tenths !== 0 && tenths !== 5 && tenths !== 20) throw fail(`multiplicador ${tenths} fora de 0, 5 e 20`);
    matrix[attacker]![defender] = tenths;
    if (afterSeparator) foresightIgnored.push({ attacker, defender });
  }

  return { records: matrix.map((against, id) => ({ id, against })), foresightIgnored };
}

/** 25 rows of five signed bytes: attack, defense, speed, special attack, special defense. */
export function readNatures(code: Uint8Array, offset: number): NatureRecord[] {
  const fail = (problem: string) => new Error(`Naturezas em ${hex(offset)}: ${problem}`);
  if (offset + NATURE_COUNT * 5 > code.length) throw fail("tabela além do fim do código");

  return Array.from({ length: NATURE_COUNT }, (_, id) => {
    const row = Array.from({ length: 5 }, (_, column) => (code[offset + id * 5 + column]! << 24) >> 24);
    const raised = row.flatMap((value, column) => (value === 1 ? [column] : []));
    const lowered = row.flatMap((value, column) => (value === -1 ? [column] : []));
    const others = row.filter((value) => value !== 0 && value !== 1 && value !== -1);
    const neutral = id % 6 === 0;

    if (neutral && row.some((value) => value !== 0)) throw fail(`a linha neutra ${id} deveria ser zerada`);
    if (!neutral && (raised.length !== 1 || lowered.length !== 1 || others.length > 0)) {
      throw fail(`a linha ${id} deveria ter exatamente um +1 e um −1`);
    }
    return {
      id,
      name: { catalog: "nature-names", index: id },
      increased: neutral ? null : BATTLE_STAT_KEYS[raised[0]!]!,
      decreased: neutral ? null : BATTLE_STAT_KEYS[lowered[0]!]!,
    };
  });
}

/** Abilities are numbered 1..N; the bank's first entry (index 0) is the empty one. */
export function readAbilityCount(bank: Uint8Array): number {
  if (bank.length < 4) throw new Error("Banco de nomes de habilidades curto demais para ter cabeçalho");
  const entries = readU16(bank, 0);
  if (entries < 2) throw new Error(`Banco de nomes de habilidades com ${entries} entradas`);
  return entries - 1;
}

export function types(): TypeRecord[] {
  return TYPE_KEYS.map((key, id) => ({ id, key, name: { catalog: "type-names", index: id } }));
}

const GROWTH_MEMBER_SIZE = 404;

/** Members 0–5 are the six growth groups (101 u32 each, levels 0–100); members 6–7 repeat group 0. */
export function readGrowthRates(members: readonly Uint8Array[]): GrowthRateRecord[] {
  if (members.length < GROWTH_RATE_KEYS.length) {
    throw new Error(`Curvas de experiência: ${members.length} membros, esperado ao menos ${GROWTH_RATE_KEYS.length}`);
  }
  return GROWTH_RATE_KEYS.map((key, id) => {
    const bytes = members[id]!;
    if (bytes.length !== GROWTH_MEMBER_SIZE) {
      throw new Error(`Curva de experiência ${id} com ${bytes.length} bytes (esperado ${GROWTH_MEMBER_SIZE})`);
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { id, key, experience: Array.from({ length: 100 }, (_, level) => view.getUint32((level + 1) * 4, true)) };
  });
}
