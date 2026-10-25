# Contract: game protocol v6 (5 → 6)

`PROTOCOL_VERSION = 6`. Schemas live in `packages/shared/src/game/protocol.ts`.

## Client → server

`input.buttons` gains bits (`BUTTON` in protocol.ts). Bits 0–3 are still the moves and bit 4 is
still the dash (spec 013). Actions fire on the press.

| Bit | `BUTTON` | Action | Valid in |
|---|---|---|---|
| 5 | `combat` | step forward and take control | walking, with a Pokémon able to fight |
| 6 | `recall` | back behind the trainer; flee | combat |
| 7 | `interact` | face each other and react | walking |

New message:

- `{ type: "swap", partyIndex: 0–5 }`: ignored when the swap is on cooldown, the member fainted or
  is already out, or the player is not in combat.

The quick-swap picker itself is client-only.

## Server → client

- `{ type: "control", entityId }`: the entity this client now moves and the camera follows. The
  server sends the Pokémon's id when combat starts or after a swap, and the trainer's id when
  combat ends.
- `{ type: "party", members: [{ species, level, hp, hpMax }], active? }`: the party in its own
  order, sent on join and whenever it changes in a fight. `active` is the member out in combat.
- `{ type: "reaction", companionId, species, emotion, bank, text }`: the client reads the text from
  its catalog and fills in the Pokémon's name.
- `{ type: "fainted", partyIndex, canContinue }`: `false` means a blackout follows.
- `{ type: "blackout", moneyLost, area }`
- Entities: the trainer carries `data.inCombat: true` during a fight. A following companion is a
  `pokemon` entity with `data: { owner, role: "companion", species }`. In combat its data is the
  combatant's, as in spec 013.
