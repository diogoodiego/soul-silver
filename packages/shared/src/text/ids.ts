// Text identifiers: "BBBB:I" (bank in 4 decimal digits, index in decimal), or "name:I" for named banks.
// See specs/005-text-catalog/research.md R7 and data-model.md.

export const TEXT_BANK_NAMES: Readonly<Record<number, string>> = {
  34: "nature-names",
  222: "item-names",
  221: "item-descriptions",
  237: "species-names",
  279: "map-names",
  720: "ability-names",
  722: "ability-descriptions",
  729: "trainer-names",
  735: "type-names",
  749: "move-descriptions",
  750: "move-names",
};

export const TEXT_REF_BANKS = {
  "species-names": 237,
  "move-names": 750,
  "item-names": 222,
  "ability-names": 720,
  "type-names": 735,
  "nature-names": 34,
} as const;

export type TextRefCatalog = keyof typeof TEXT_REF_BANKS;

const BANK_BY_NAME: ReadonlyMap<string, number> = new Map(
  Object.entries(TEXT_BANK_NAMES).map(([bank, name]) => [name, Number(bank)]),
);

export interface ParsedTextId {
  bank: number;
  index: number;
}

export function parseTextId(id: string): ParsedTextId {
  const match = /^([^:]+):(\S+)$/.exec(id);
  if (!match) throw new Error(`Identificador de texto inválido: "${id}" (esperado "BBBB:I")`);
  const [, head, tail] = match as unknown as [string, string, string];

  const bank = /^\d{1,4}$/.test(head) ? Number(head) : BANK_BY_NAME.get(head);
  if (bank === undefined) throw new Error(`Banco desconhecido em "${id}"`);
  if (!/^\d+$/.test(tail)) throw new Error(`Índice inválido em "${id}" (esperado inteiro ≥ 0)`);
  const index = Number(tail);
  if (!Number.isSafeInteger(index)) throw new Error(`Índice fora da faixa em "${id}"`);
  return { bank, index };
}

export function formatTextId(bank: number, index: number): string {
  return `${String(bank).padStart(4, "0")}:${index}`;
}
