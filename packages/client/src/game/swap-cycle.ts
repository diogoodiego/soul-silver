// Quick swap (Q/E): the next or previous member able to fight, skipping the one out. In combat it is sent
// out; on the field it follows the trainer (set-follower), and the party order stays.

type Slot = { hp: number; egg?: unknown };

/** `launchable`: while surfing, which members may be sent out (spec 025); undefined on land. */
export function cycleSwap(party: readonly Slot[], active: number | undefined, dir: 1 | -1, launchable?: readonly boolean[]): number | undefined {
  const n = party.length;
  const start = active ?? (dir === 1 ? -1 : n);
  for (let step = 1; step <= n; step++) {
    const i = (((start + dir * step) % n) + n) % n;
    const m = party[i]!;
    if (i !== active && !m.egg && m.hp > 0 && (launchable?.[i] ?? true)) return i;
  }
  return undefined;
}
