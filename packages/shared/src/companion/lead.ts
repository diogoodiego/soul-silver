/** The companion: the first party member that has not fainted and is not an egg (spec 014, FR-001; spec 029.2). */
export function leadIndex(party: readonly { hp: number; egg?: unknown }[]): number | undefined {
  const i = party.findIndex((m) => m.hp > 0 && !m.egg);
  return i === -1 ? undefined : i;
}
