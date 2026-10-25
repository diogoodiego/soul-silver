/** The companion: the first party member that has not fainted (spec 014, FR-001). */
export function leadIndex(party: readonly { hp: number }[]): number | undefined {
  const i = party.findIndex((m) => m.hp > 0);
  return i === -1 ? undefined : i;
}
