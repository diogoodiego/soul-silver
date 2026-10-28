# Quickstart: validar Cutscenes e NPCs

Pré-requisitos: `npm install`, extração da ROM em `%APPDATA%\SoulSilver Desktop\extraction\stages\`. Detalhes de execução na skill `run-soulsilver`.

## Testes automáticos

```bash
npm run typecheck
npx vitest run packages/shared/test/npc packages/server/test
```

Cobrem: padrões de movimento (determinismo, limites de área, colisão), `busy` (sem dano, sem interação, selvagem desiste), isolamento entre dois jogadores (posição permanente só para quem viveu o evento), protocolo v14 e migração do save 5 → 6.

## Verificação manual (cliente)

```bash
npm run build -w @soulsilver/app
node .claude/skills/run-soulsilver/driver.mjs "$TEMP/ss-run" <passos>
```

1. **NPCs**: em New Bark Town e Cherrygrove, conferir parado / olhando / vagando / caminho fixo e que bloqueiam a passagem.
2. **Introdução**: novo save → cutscene do Prof. Oak com nome e personagem escolhidos.
3. **Laboratório do Elm, rival e ovo**: comparar lado a lado com o original (movimentos e câmera).
4. **Dois jogadores (LAN local)**: um dispara a cutscene; o outro joga normalmente e vê "ocupado".
5. **Posição permanente**: A conclui o evento do NPC que sai do caminho; B ainda é bloqueado.
6. **Selvagem**: com um selvagem perseguindo, disparar cutscene; ele desiste e não há dano.

## Resultados (2026-10-27)

### Log de comandos faltantes (T041)

Levantamento sobre os 497 arquivos de script da extração, depois da implementação:

- Ações de movimento sem suporte: `MoveAction_105` a `MoveAction_112` (sem nome na tabela; 12 usos ao todo). Encerram o script como faltante.
- Comandos de câmera sem handler: `LegendCutsceneMoveCameraTo`, `LegendCutscenePanCameraTo`, `LegendCutsceneWaitCameraPan` (4 usos cada) e `LegendCutsceneLugiaArrivesEffectCameraPan` (1). São das cenas de Lugia e Ho-Oh, longe dos quatro eventos desta spec.
- Agora tratados: `WarpIn`/`WarpOut` (aparecer/sumir), os comandos do Pokémon seguidor (~1500 usos: sem efeito, o companheiro anda pelas regras da spec 014), `SetObjectMovementType` e `PlayerMovementSaving*` (sem efeito).

### Verificação manual

- **NPCs em New Bark (T014b)**: aparecem, andam e viram (sequência de capturas com 2,5 s de intervalo). A figura cinza translúcida a oeste da casa do jogador não é NPC: bloqueia a passagem, não responde à interação e nenhum evento do mapa 60 está naquele tile. É um objeto do mapa, fora desta spec.
- **Introdução, Elm, rival e ovo (T028)**, **dois jogadores (T033)**, **selvagem (T038)**: não verificados no app. A introdução precisa de um save novo (os três slots estão ocupados), os eventos do Elm já passaram no save existente e o app aceita uma instância só, o que impede dois clientes pelo driver. Cobertos por testes automatizados (`scripts-intro`, `scripts-cutscene`, `busy-safety`, `busy-combat`).
