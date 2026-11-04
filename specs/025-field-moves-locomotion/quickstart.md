# Quickstart: validar golpes de campo e locomoção

Pré-requisitos: dependências instaladas; para as camadas 3 e 4, ROM extraída (`SOULSILVER_ROM`) e o save do slot 3 como save de teste.

| Camada | Comando | Resultado esperado |
|--------|---------|--------------------|
| 1 e 2 | `npx vitest run` | regras por golpe, pesca (1.000 por vara), 493 classes, migração v9 e cenários multijogador passam |
| 3 | `npm run golden -w @soulsilver/app` e a sonda de campo em `packages/app/golden/field.golden.ts` | cada tipo de obstáculo real: bloqueado antes e livre depois; espécies de pesca e surf pertencem à tabela do mapa |
| 4 | `node .claude/skills/run-soulsilver/driver.mjs [passos]` | capturas 01–08 em `.evidence/025/` |
| 5 | roteiro manual | pescar com teclado e com gamepad: a janela de reação parece justa |

Preparar estado no app/sonda: `debugGiveBadge`, `debugTeachMove`, `debugGiveItem` e `debugWarp` (só em build de desenvolvimento, com o depurador de scripts ligado).

Contratos: [protocol-v19.md](contracts/protocol-v19.md), [save-v9.md](contracts/save-v9.md). Dados: [data-model.md](data-model.md).
