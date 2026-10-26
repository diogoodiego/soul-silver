# Data Model: Interface básica, menu inicial e controles

## AppSettings (por PC, `settings.json`)

| Campo | Tipo | Default | Regra |
|-------|------|---------|-------|
| firewallNoticeSeen | boolean | false | já existe |
| window | `{width,height}` | 1280×720 | um dos tamanhos de R10 |
| fullscreen | boolean | false | |
| textSpeed | `"slow" \| "mid" \| "fast"` | `"mid"` | 8 / 4 / 1 quadro por caractere |
| uiScale | number | 1 | 0,75–1,5, passo 0,25 |
| bindings | `Record<Action, string[]>` | padrões de R3 | só teclado; códigos `KeyboardEvent.code`; sem teclas reservadas; cada código em uma única ação |

Campo ausente ou inválido → default daquele campo (arquivo antigo continua válido).

## Action (shared/input/bindings.ts)

Enum: `up, down, left, right, confirm, cancel, menu, tabPrev, tabNext, run, dash, move1, move2, move3, move4, combat, recall, interact, picker, throw, nextBall`.
Cada ação tem teclas padrão e um botão Xbox fixo (Standard Gamepad index).

`rebind(bindings, action, code)` → novo mapa; se `code` já pertence a outra ação, troca as teclas entre as duas; se `code` é reservado, erro.

## SlotSummary (ok) — ampliado

`+ badges: number` (0–16, contado do save).

## Entidade do jogador — `data.busy`

`boolean` em `entity.data`; verdadeiro enquanto o menu completo está aberto e fora de combate.

Transições: `livre --menu open--> ocupado`; `ocupado --menu close--> livre`; `ocupado --combate começa--> livre` (servidor zera).

## Pedido de diálogo (client)

| Campo | Tipo |
|-------|------|
| bank, id | chave do catálogo (spec 5) |
| vars | valores das variáveis |
| kind | `"say" \| "ask"` |
| result | `void` ou `boolean` (Sim = true; cancelar = false) |

Estados: `typing → complete → (ask: choosing) → done`.

## Tela (client)

`firstRun | title | home | about | settings | controls | play-save | play-mode | play-join | game`.
`cancel` volta: play-join → play-mode → play-save → home; settings/about → home; controls → settings.
