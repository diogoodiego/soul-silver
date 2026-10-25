# Data Model: Combate em tempo real

Unidades: distâncias em pixels de mundo (`MAP_TILE_PX` = 1 tile), tempos em segundos nos dados e
em ticks (20 Hz) no servidor. Formato dos arquivos em [contracts/combat-data.md](contracts/combat-data.md).

## Archetype (`content/combat/archetypes.json`)

| Campo | Tipo | Regra |
|-------|------|-------|
| id | string kebab | único |
| behavior | enum de 9 | `melee`, `projectile`, `beam`, `self-area`, `target-area`, `dash`, `self-buff`, `target-debuff`, `field` |
| defaults | MoveParams parcial | preenche o que o mapeamento omitir |

Obrigatórios: os 9 base e `generic-physical`, `generic-special`, `generic-status`.

## MoveParams / MoveMapping (`content/combat/moves.json`)

| Campo | Tipo | Regra |
|-------|------|-------|
| id | id de golpe | existe em `moves.json` extraído; único e crescente |
| archetype | id | existe |
| rangePx | número ≥ 0 | alcance (projétil: distância máxima; área mirada: distância do ponto) |
| hitbox | `{shape:"circle",radiusPx}` \| `{shape:"capsule",lengthPx,widthPx}` \| `{shape:"arc",radiusPx,angleDeg}` | coerente com o behavior |
| castS | 0..5 | tempo antes do efeito; o usuário não anda durante a conjuração se `rooted` |
| cooldownS | número opcional | sobrescreve o derivado (R5) |
| speedPx | número | só projétil/investida, por segundo |
| hits | inteiro 1..10 | acertos por alvo por uso |
| durationS | número | só field/área persistente |
| effects | Effect[] | ver abaixo |

**Effect** (união por `kind`): `damage` (`power`, `fixed`, `level`, `targetHpFraction` opcionais), `status` (`status`, `chance`), `stages` (`target: self|target`, `stat`, `delta` −6..+6, `chance`), `heal` (`fraction`), `recoil` (`fraction`), `drain` (`fraction`), `flinch` (`chance`), `knockback` (`px`), `weather` (`sun|rain|hail`), `reset-stages`. `chance` omitida = chance original do efeito do golpe (100 se 0).

## StatusDef (`content/combat/statuses.json`)

| Campo | Tipo | Regra |
|-------|------|-------|
| id | `burn` \| `poison` \| `toxic` \| `paralysis` \| `sleep` \| `freeze` \| `confusion` | todos presentes |
| major | boolean | todos menos `confusion` |
| durationS | `{min,max}` | `max ≥ min`; freeze usa `max` como teto |
| intervalS | número opcional | dano periódico / checagem de descongelar |
| tickDamage | fração de HP máx. | burn/poison; toxic usa `n/16` crescente |
| modifiers | `{attackMul?, speedMul?, immobile?}` | |
| chances | `{skipMove?, thawPerInterval?, misdirect?, deviationDeg?}` | 0..100 |
| immuneTypes | ids de tipo | |

## Tuning (`content/combat/tuning.json`)

`cooldown {a,b,c,min,max,statusPower}`, `speed {low,high,moveMinPx,moveMaxPx,cooldownMaxCut}`,
`crit {stageChances:[16,8,4,3,2]}` (1/n), `knockbackPx`, `flashS`, `bodyRadiusPx`.

## Combatant (estado no servidor)

| Campo | Regra |
|-------|-------|
| entityId, owner (`playerId` \| `"wild"`) | |
| species, level, types[1..2], moves[≤4] | moves são ids; sem mapeamento → genérico da categoria |
| stats {hp,atk,def,spa,spd,spe} | fórmula Gen 4 (R4) |
| hp | 0..stats.hp; em 0 para de agir e de receber dano |
| stages {atk,def,spa,spd,spe,accuracy?,evasion?} | −6..+6; zera ao voltar para a Poké Ball (spec 14) |
| major | `{id, untilTick, counter}` \| null |
| confusion | `{untilTick}` \| null |
| cooldowns[4] | tick em que fica pronto |
| casting | `{slot, aim, readyTick}` \| null |

**Transições**: `idle → casting → (efeito) → idle`; status: `none → major → none` (expira, cura,
descongela); sono/congelamento bloqueiam `idle → casting` e movimento. `hp=0 → fainted` (terminal
neste spec).

## ActiveMove (entidade `projectile` ou só no servidor)

`id, caster, slot, mapping, origin, aim, spawnTick, endTick, hitCounts: Map<target, n>`.

## HitEvent (enviado ao cliente)

`tick, attacker, target, move, damage, effectiveness (0|0.25|0.5|1|2|4), crit, knockback {x,y},
statusApplied?, stageChanges?, result (hit|immune|blocked)`.
