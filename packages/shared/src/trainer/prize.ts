// Prize money for beating a trainer (spec 022, research R4): the class base times the level of the
// team's last Pokémon times 4, doubled in a double battle.

export function prize(o: { prizeBase: number; team: readonly { level: number }[]; double: boolean }): number {
  const last = o.team.at(-1)?.level ?? 0;
  return o.prizeBase * last * 4 * (o.double ? 2 : 1);
}
