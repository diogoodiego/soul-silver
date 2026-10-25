# Contract: save v4 (3 → 4)

`SAVE_SCHEMA_VERSION = 4`. Schema in `packages/shared/src/save/schema.ts`.

New fields on `party[]` and `storage[]`:

| Field | Type | Rule |
|---|---|---|
| `experience` | int | ≥ 0 |
| `ivs` | `{ hp, attack, defense, speed, spAttack, spDefense }` | each 0–31 |
| `evs` | same keys | each 0–255, sum ≤ 510 |
| `nature` | int | 0–24 |

New top-level field:

| Field | Type | Rule |
|---|---|---|
| `pending` | `ProgressionItem[]` | see data-model.md; `member` < `party.length` |

Migration 3 → 4: for each member `ivs` all 31, `evs` all 0, `nature: 0` (Hardy), `experience` set
to the minimum for its `level` on medium-fast (`level³`, `0` at level 1), and `pending: []`. Using
medium-fast keeps the migration pure; on load the server snaps `experience` to the real curve
minimum if it is lower (research R8).
