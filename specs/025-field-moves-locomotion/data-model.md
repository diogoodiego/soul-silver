# Data Model: Golpes de campo e locomoção

## FieldMoveRules (`content/field/moves.json`, escrito à mão)

| Campo | Tipo | Regra |
|-------|------|-------|
| `moves[].move` | id de golpe | Cut, Rock Smash, Strength, Surf, Whirlpool, Waterfall, Rock Climb, Flash, Fly, Headbutt, Dig, Teleport |
| `moves[].obstacle` | enum | `tree`, `rock`, `boulder`, `whirlpool`, `waterfall`, `climbWall`, `darkCave`, `water`, `headbuttTree`, `none` |
| `moves[].badge` | 0..15 ou ausente | insígnia exigida, copiada de `field_move.c` da decomp (R1); ausente em Flash, Headbutt, Dig e Teleport |
| `bikeSpeed` | número | velocidade da bicicleta, acima da corrida |
| `escapeRope` | item id | item que sai da caverna |

Escuridão: mapa com `weather` em `darkWeather` (11 ou 12) em `map-headers.json`. Bicicleta, Fly e Escape Rope (e Dig) seguem os bits `bikeAllowed`, `flyAllowed` e `escapeRopeAllowed` do mesmo cabeçalho (estágio `maps` versão 8).

## FlyPoints (extraído; `fly-points.json`)

| Campo | Tipo | Regra |
|-------|------|-------|
| `points[].flypoint` | 0..37 | `FLYPOINT_*` da ROM |
| `points[].map`, `tx`, `ty` | int | mapa e tile de pouso |

## Locomotion (`content/species/locomotion.json`)

`{ [speciesId 1..493]: "terrestrial" | "aquatic" | "flying" | "levitating" }`. Teste: 493 chaves, nenhuma faltando ou extra.

## Fishing (`content/field/fishing.json`)

| Campo | Tipo | Regra |
|-------|------|-------|
| `rods.{old,good,super}.waitS` | `[min, max]` | espera antes da mordida |
| `rods.*.windowS` | número | janela de reação |
| `rods.*.baseBite` | 0..1 | chance base de fisgar |
| `friendshipBite` | 0..1 | acréscimo máximo com amizade 255 |

## Save v9 (mudanças sobre v8)

| Campo | Tipo | Regra |
|-------|------|-------|
| `badgeSet` | int 0..0xFFFF | substitui `badges`; bit i = insígnia i |
| `flyPoints` | `string[]` sem repetição | áreas de voo visitadas |

Migração 8→9: `badgeSet = (1 << badges) - 1`; `flyPoints = []`. A migração não conhece `fly-points.json` (dado extraído); a área atual entra no primeiro tick depois de o jogador entrar na sessão (`field.step`), o mesmo efeito.

## Estado de sessão (não persistido)

| Campo | Tipo | Regra |
|-------|------|-------|
| `mode` | `walk\|run\|bike\|surf\|fish` | transições validadas pelo servidor |
| `removedObstacles` | `Set<objectId>` | zera na troca de mapa; nunca replicado a outros |
| `lit` | boolean | Flash ativo no mapa atual; zera na troca de mapa |
| `fishing` | `{ state, deadline, rod }` | `idle → casting → waiting → bite → hooked\|escaped` |

## Transições de `mode`

`walk ⇄ run` (já existente) · `walk|run → bike` (exterior apenas) · `bike → walk` · `walk → surf` (borda da água, insígnia + golpe) · `surf → walk` (borda de terra) · `walk → fish` (vara + água adjacente) · `fish → walk` (escapou, fisgou ou cancelou).
