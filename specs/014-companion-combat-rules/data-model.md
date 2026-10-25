# Data Model: Pokémon companheiro e regras do combate no mundo

## PartyMember (save v2)

| Campo | Tipo | Regra |
|---|---|---|
| species | int 1–493 | existe em `species` |
| level | int 1–100 | |
| moves | int[1..4] | ids de golpe |
| hp | int ≥ 0 | 0 = desmaiado; ≤ HP máximo calculado |
| friendship | int 0–255 | |

O save v2 adiciona `party: PartyMember[0..6]`, `money: int 0–999999`, `badges: int 0–16` e
`respawn: {area, x, y} | null`. Ver [contracts/save-v2.md](contracts/save-v2.md).

## TrailStep (servidor, memória)

`{ area, x, y, facing, step: "walk" | "hop" | "warp" }`, numa fila com capacidade
`respawnTiles + 2`.

## Companion (entidade `pokemon`)

`data: { owner, role: "companion", species, state: "follow" | "ball" | "combat" }`

- `lead(party)` = primeiro membro com `hp > 0`; muda quando ele desmaia ou a equipe é reordenada.
- Transições:
  - `follow → ball`: entra em prédio sendo grande, ou em local restrito.
  - `ball → follow`: sai desse lugar.
  - `follow | ball → combat`: botão de combate.
  - `combat → follow`: recolher ou fim do combate.
  - `combat → ball`: desmaio ou troca.

## BattleState (servidor, por jogador)

`{ mode: "walk" | "combat", activeIndex, swapReadyTick, anchor: {x, y}, lastThreatTick }`

- `walk → combat`: botão de combate com `lead` existente.
- `combat → walk`: recolher; sem ameaça por `disengageSeconds`; blackout.
- Blackout (todos com `hp = 0`): `money -= perda`, posição = `respawn ?? homeSpawn`, equipe
  curada, `mode = walk`.

## Dados (content/companion)

Ver [contracts/companion-data.md](contracts/companion-data.md): `FollowRules`, `ReactionRules`,
`BattleRules`.
