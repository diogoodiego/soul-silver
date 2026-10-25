# Contract: save v2 (1 → 2)

New fields (see [data-model.md](../data-model.md)): `party` (at most 6), `money` (0–999999),
`badges` (0–16) and `respawn` (`{ area, x, y } | null`).

Migration 1 → 2 (`SAVE_MIGRATIONS[1]`): `party: []`, `money: 3000`, `badges: 0`, `respawn: null`.
New games go through the same migration.

Coherence (new entry in `COHERENCE_RULES`): `respawn.area` must exist in the world. The saved HP
is not checked against the species here, because the world lookup has no species data. Instead the
server caps each member's HP at its maximum for the level when the player joins.

`respawn` is written when the trainer enters a map listed in `battle-rules.json` →
`pokemonCenters`, at the spot where the trainer arrives. `null` means home (the new-game start
position).

Development builds (`--dev-arena`) give a save with an empty party a test party (Cyndaquil, Onix,
Pidgey) until the starter event exists.
