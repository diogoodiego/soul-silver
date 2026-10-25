# Contract: save v3 (2 → 3)

`SAVE_SCHEMA_VERSION = 3`. Schema in `packages/shared/src/save/schema.ts`.

New fields:

| Field | Type | Rule |
|---|---|---|
| `bag` | `{ item, count }[]` | `item` 1–65535; `count` 1–999; no duplicate item |
| `pokedex.seen` | `int[]` | species 1–493, unique |
| `pokedex.caught` | `int[]` | species 1–493, unique, each also in `seen` (coherence rule) |
| `storage` | `PartyMember[]` | length ≤ 30 (`STORAGE_MAX`); moves to the PC in spec 21 |
| `party[].shiny`, `storage[].shiny` | `boolean`, optional | absent means not shiny |

Migration 2 → 3: `bag: []`, `storage: []`, and a Pokédex with every `party` species as seen and
caught. A new game (v1, migrated) starts with all three empty.
