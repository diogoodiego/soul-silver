# Contract: game protocol v7 (6 → 7)

`PROTOCOL_VERSION = 7`. Schemas live in `packages/shared/src/game/protocol.ts`.

## Client → server

| Bit | `BUTTON` | Action | Valid in |
|---|---|---|---|
| 8 | `throw` | throw the selected ball toward `input.aim` (or the way the thrower faces) | walking or in combat |

The ball leaves the Pokémon the player controls in combat, or the trainer.

New message:

- `{ type: "select-ball", item }`: the ball the next throw uses; ignored if not in the bag.

## Server → client

- Entities: a wild Pokémon is a `pokemon` entity whose data is its combatant's, as in spec 013
  (`owner: "wild"`, `species`, `level`, `hp`…), plus `shiny: true` when shiny. A ball in flight is a
  `projectile` entity with `data: { ball: item, owner }`.
- `{ type: "capture", wildId, player, ball, shakes: 0–3, caught }`: sent to everyone in the area
  on hit; clients play the shakes, then the result.
- `{ type: "captured", species, to: "party" | "storage" }`: to the catcher only, after the shakes.
- `{ type: "bag", items: [{ item, count }], selected? }`: the balls in the bag and the one the next
  throw uses; on join and on change.
- `{ type: "pokedex", seen: int[], caught: int[] }`: on join and on every change.
- `{ type: "notice", code: "no-balls" | "storage-full" | "ball-returned" }`.

When two balls hit the same wild Pokémon on the same tick, the lower player id wins; the other ball
goes back to its bag with `ball-returned`.
