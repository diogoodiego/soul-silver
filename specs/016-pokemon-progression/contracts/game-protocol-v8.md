# Contract: game protocol v8 (7 → 8)

`PROTOCOL_VERSION = 8`. Schemas in `packages/shared/src/game/protocol.ts`.

## Server → client

| Message | Fields | When |
|---|---|---|
| `exp-gain` | `partyIndex`, `amount` | on a KO, per participant (shown as a small toast; not a decision) |
| `progression` | `item: ProgressionItem`, `stats?`, `gains?`, `moves?` | after combat ends, one at a time; `level-up` carries the new stats and the gains, `learn` the moves known now |
| `party` | (existing) | after each item resolves, with the new species/level |

Only `learn` with four known moves and `evolve` wait for an answer; the others advance on the
client's `progression-ack`.

## Client → server

| Message | Fields | Rule |
|---|---|---|
| `progression-ack` | — | advances a non-decision item |
| `learn-answer` | `forget: 0–3 \| null` | `null` skips the move |
| `evolve-answer` | `accept: boolean` | `false` is the cancel button |

The server ignores answers while in combat or when the head of the queue has another kind.
Other players see the new species and level through the existing entity state.
