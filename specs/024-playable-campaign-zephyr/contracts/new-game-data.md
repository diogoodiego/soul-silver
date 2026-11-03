# Contrato: dados de jogo novo e tabela de mensagens padrão

Origem: [research.md](../research.md) R1 e R3. Ambos vêm do estágio `events` (versão 4 → 5), no envelope dos arquivos de eventos (`parseEventsFile`).

## `events/events/new-game.json`

```json
{ "kind": "new-game", "formatVersion": 1, "map": 64, "tx": 6, "ty": 6, "facing": "south", "initScript": 9600 }
```

- `map`, `tx`, `ty`, `facing`: `sLocation_PlayerRoom`, ARM9 `0xfa17c` (cinco u32: mapa, warp `0xFFFFFFFF`, x, y, direção 0 norte / 1 sul / 2 oeste / 3 leste).
- `initScript`: `_std_init`; o servidor o executa uma vez no jogo novo, como `RunInitScript`.
- O estágio falha se o warp não for `0xFFFFFFFF` ou a direção for inválida.

## `events/events/std-messages.json`

```json
{ "kind": "std-messages", "formatVersion": 1, "banks": [752, 211, 30, 435] }
```

`ov01_022067C8`, overlay 1 `0x20ec8`, 4 × u16. `GetStdMsgNaix(índice, destino)`: `destino = banks[índice]`, 0 fora da tabela. `MsgBoxExtern(banco, mensagem)`: mostra `banco:mensagem` do catálogo de texto.

## No servidor

`ScriptData.newGame` (sem `kind`/`formatVersion`) e `ScriptData.stdMessageBanks`, lidos por `loadScripts`; ausentes numa extração anterior.
