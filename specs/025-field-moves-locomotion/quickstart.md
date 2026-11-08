# Quickstart: validar golpes de campo e locomoção

Pré-requisitos: dependências instaladas; para as camadas 3 e 4, ROM extraída (`SOULSILVER_ROM`) e o save do slot 3 como save de teste.

| Camada | Comando | Resultado esperado |
|--------|---------|--------------------|
| 1 e 2 | `npx vitest run` | regras por golpe, pesca (1.000 por vara), 493 classes, migração v9 e cenários multijogador passam |
| 3 | `npm run golden -w @soulsilver/app` e a sonda de campo em `packages/app/golden/field.golden.ts` | cada tipo de obstáculo real: bloqueado antes e livre depois; espécies de pesca e surf pertencem à tabela do mapa |
| 4 | `node .claude/skills/run-soulsilver/driver.mjs [passos]` | capturas 01–12 em `.evidence/025/`: 01–08 do spec (Cut, surf, pesca, Fly, caverna escura, bicicleta) e 09–12 da verificação de UI (página Campo, Fly a partir dela, linha "Vara de pesca" nos Controles, seletor no surf) |
| 5 | roteiro manual | pescar com teclado e com gamepad: a janela de reação parece justa |

Preparar estado no app/sonda: `debugGiveBadge`, `debugTeachMove`, `debugGiveItem` e `debugWarp` (só em build de desenvolvimento, com o depurador de scripts ligado).

Contratos: [protocol-v19.md](contracts/protocol-v19.md), [save-v9.md](contracts/save-v9.md). Dados: [data-model.md](data-model.md).

## Roteiro manual da pesca (camada 5)

1. Abrir o app no slot 3, ligar o depurador de scripts (F3) e, pelo console, dar as varas (`debugGiveItem` 445, 446 e 447) e ir a uma margem com as três tabelas: `debugWarp` mapa 12, tile 1276, 115, virado para o norte.
2. **Teclado**: `C` lança a melhor vara da mochila; ao aparecer "Fisgou! Puxe agora!", apertar `C` ou `E`. Repetir 10 vezes com cada vara (dá para tirar as melhores com `debugGiveItem` só da vara desejada num save novo).
3. **Gamepad**: o mesmo com o botão do analógico direito (R3) para lançar e puxar, e o direcional para cima (interagir) para puxar.
4. Anotar em `tasks.md` (notas de US3): quantas mordidas foram puxadas a tempo de cada 10, por vara e por entrada, e se a janela (1,5 s, 1,2 s e 1 s) pareceu justa. Ajustes vão em `content/field/fishing.json` (`windowS`).
