# Data Model: Campanha jogável até a Insígnia Zephyr

## NewGameData (extraído; `new-game.json`, pasta de dados)

| Campo | Tipo | Regra |
|-------|------|-------|
| `map` | int | id do mapa inicial (esperado 64) |
| `tx`, `ty` | int | tile inicial |
| `facing` | "north"\|"south"\|"east"\|"west" | direção inicial (original: 0 norte, 1 sul, 2 oeste, 3 leste) |
| `initScript` | int | script rodado uma vez no jogo novo (original: 9600, `_std_init`) |

Validado com zod no carregamento. Aplicação (puro, `shared/new-game`): `applyNewGame(save, data)` → save com `area`, `x`, `y`, `facing`, `flags: [960]` (de `NewGame_InitSaveData`, research R1), party e dex vazios. As flags `FLAG_HIDE_*` vêm de rodar `initScript` no servidor ao criar o save.

## StdMessages (extraído; `std-messages.json`)

`{ banks: int[] }` (original: `[752, 211, 30, 435]`), índice → banco de texto para `GetStdMsgNaix`.

## Save v8 (mudanças sobre v7)

| Campo | Tipo | Regra |
|-------|------|-------|
| `rivalName` | string | 0..`PLAYER_NAME_MAX`; vazio até `NameRival` |
| `storyRev` | int ≥ 0 | 0 = história desatualizada; 1 = aplica `new-game.json` |

Criação: `party = []`, dex vazia, sem inicial. Migração 7→8: `rivalName = ""`, `storyRev = 0`; todo o resto intacto.

Transição `restartStory(save, newGameData)`: mantém `name`, `character`, `playTimeMs`, `rev`; refaz o resto como save novo; `storyRev = 1`.

## FlagChange (memória do servidor, por jogador, anel de 64)

`{ tick: int, kind: "flag"|"var", id: int, value: int (flag 0/1), script: string }`, `script` = `arquivo:entrada` ou `dev`.

## DebugObject / DebugTrigger (derivados, somente leitura)

- `DebugObject`: `{ id, sprite, hideFlag: int|null, visible: bool }`.
- `DebugTrigger`: `{ kind: "mapScript"|"trigger", script, condition: string, met: bool }`.

## Milestone (dados do caminho dourado)

`{ n: 1..10, name, checks: { flags?: int[], flagsOff?: int[], vars?: {id,value}[], map?: int } }`. Ids confirmados na primeira execução com a ROM real e registrados em [contracts/golden-path.md](contracts/golden-path.md).

## Relações

NewGameData → (aplicado em) Save novo / restartStory. Save.flags/vars → filtro de visibilidade → DebugObject. Script runner → FlagChange. Milestone → lê Save.flags/vars via servidor.
