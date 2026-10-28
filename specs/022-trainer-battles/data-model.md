# Data Model: Batalhas contra treinadores

## TrainerRecord (existente, `events/schemas.ts`)
`id, class{id,text}, name, items[≤4], aiFlags, doubleBattle, team[1..6]`. Sem mudança.

## TrainerClass (novo, extraído)
| Campo | Tipo | Regra |
|---|---|---|
| id | int 0..255 | único |
| prizeBase | int ≥ 0 | da tabela original |
| music | `"trainer" \| "rival" \| "leader"` | por classe |

## TrainerProfile (derivado, puro)
| Campo | Tipo |
|---|---|
| combat | id de perfil de `content/ai/profiles.json` |
| switch | `{ enabled, typeThreshold, hpThreshold, cooldownS }` |
| item | `{ enabled, hpThreshold }` |

Validação: limiares em [0,1]; `typeThreshold` ∈ {1, 2, 4}.

## TrainerBattle (servidor, em memória)
| Campo | Tipo |
|---|---|
| id | number |
| playerId | number |
| trainerId, npcId | number |
| arena | `{ area, x, y, radiusPx }` |
| double | boolean |
| team | `{ member, hp, fainted }[]` |
| active | índices em campo (1 ou 2) |
| itemsLeft | item ids |
| ally | entity id \| null |

### Estados
`spotted → approaching → challenge → fighting → (won | lost | aborted)`
- `won`: fala de derrota, prêmio, XP, flag → remove.
- `lost`: blackout → remove (sem flag).
- `aborted`: desconexão → remove (sem flag).

Regras: um jogador tem no máximo uma batalha; treinador com flag de derrota daquele jogador não avista; o mesmo `trainerId` pode estar em batalhas de jogadores distintos.

## Combatente (existente) ganha
`battleId: number | null` — acerto só entre combatentes com o mesmo `battleId`.
