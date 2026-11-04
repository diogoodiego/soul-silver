# Contrato: protocolo v19 (sobre v18)

`PROTOCOL_VERSION` 18 → 19. Clientes de versão diferente recusam a conexão (princípio VI). Schemas em `packages/shared/src/game/protocol.ts`; teste em `packages/shared/test/game/protocol-v19.test.ts`.

## Cliente → servidor

| Tipo | Campos | Efeito / validação |
|------|--------|--------------------|
| `field-interact` | `objectId` | servidor abre o diálogo do obstáculo; responde com `field-prompt` se algum golpe da equipe o supera |
| `field-use` | `move` (chave de `content/field/moves.json`, ex. `cut`), `objectId?` | executa o golpe; recusado sem insígnia, sem golpe na equipe ou fora de contexto |
| `field-mount` | `mode: "bike"\|"surf"` | recusado em interior (bike) ou fora da borda da água / sem Surf (surf) |
| `field-dismount` | — | volta a `walk` |
| `field-fish` | `rod: "old"\|"good"\|"super"` | entra em `fish` |
| `field-reel` | — | reage à mordida; só vale dentro da janela |
| `field-fly` | `area` | recusado se `area` não está em `flyPoints` do jogador |
| `debugGiveBadge` | `badge` 0..15 | só em build de desenvolvimento com o depurador ligado |
| `debugTeachMove` | `slot` 0..5, `move` | idem; sem membro no slot, nada muda |
| `debugGiveItem` | `item`, `count` 1..999 | idem |

O teleporte de desenvolvimento já existe desde o protocolo 17 (`debugWarp`) e é reaproveitado.

## Servidor → cliente

| Tipo | Campos |
|------|--------|
| `field-prompt` | `move`, `user` (índice do membro que usa), `dialog?` — pergunta sim/não; a resposta é `field-use` |
| `field-result` | `ok`, `reason?` (`badge`, `move`, `notHere`, `indoors`, `notVisited`, `notAllowed`, `busy`) |
| `field-removed` | `objectId` — só para o jogador que removeu |
| `player-mode` | `mode: "walk"\|"run"\|"bike"\|"surf"\|"fish"` — do próprio jogador; a exibição aos outros jogadores entra com o render (US2/US4) |
| `field-fishing` | `state: "waiting"\|"bite"\|"hooked"\|"escaped"`, `windowMs?` (com a mordida) |
| `field-fly-map` | `points[]` `{ area, flypoint }` — só os visitados |
| `field-launchable` | `launchable: boolean[]` (até 6) — durante o surf |
| `field-lit` | `lit` |

`debug*` fora de build de desenvolvimento (ou com o depurador desligado) não mudam nada e são registrados no log, como `debugWarp`. Até as histórias implementarem, o servidor responde às mensagens `field-*` com `field-result { ok: false, reason: "notAllowed" }`.
