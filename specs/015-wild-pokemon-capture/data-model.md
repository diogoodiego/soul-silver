# Data Model: Pokémon selvagens e captura

## Wild (entidade `pokemon`, servidor)

`data: { role: "wild", species, level, shiny, status? }` + combatente `owner: "wild"` (spec 13).

Estado só no servidor: `{ originX, originY, temperament, ai: "wander" | "flee" | "chase" | "return"
| "capturing", lastNearTick, firstEngageTick | null, angry: boolean }`.

- `wander → flee`: passivo sofre dano; arisco vê jogador.
- `wander → chase`: agressivo detecta jogador; territorial com jogador no território; `angry` após captura falha.
- `* → return`: distância da origem > `leashTiles`; volta a `wander` ao chegar.
- `* → capturing`: acerto de bola; sai para removido (sucesso) ou `chase`/estado anterior (falha).
- Removido: despawn, desmaio ou captura.

## SpawnArea (servidor, memória)

`{ area, cells: [x, y][], cap, nextSpawnTick, wilds: Set<entityId> }`, criada quando a área tem
encounter e zona não vazia.

## CaptureAttempt (servidor)

`{ player, wildId, ball, shakes: 0..3, caught, resolveTick }`. O resultado é sorteado no acerto e
revelado ao fim das balançadas.

## Save v3

- `bag: { item: int, count: int 1–999 }[]`
- `pokedex: { seen: int[], caught: int[] }` (espécies 1–493, sem repetição; `caught ⊆ seen`)
- `storage: PartyMember[0..storageMax]`
- `PartyMember.shiny?: boolean` (ausente = não shiny)

Ver [contracts/save-v3.md](contracts/save-v3.md).

## Dados (content/wild)

Ver [contracts/wild-data.md](contracts/wild-data.md): `SpawnRules`, `Temperaments`, `Balls`.
