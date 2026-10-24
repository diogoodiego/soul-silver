# Implementation Plan: Mundo, movimento e warps

**Branch**: `011-world-movement-warps` | **Date**: 2026-10-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/011-world-movement-warps/spec.md`

## Summary

Tornar o mapa extraído (006) jogável sobre o servidor da 010. O passo de movimento que já existe
em `shared/src/game/movement.ts` (`stepMovement`, só 4 direções, sem ressaltos) vira o passo
completo: vetor analógico com corrida (só no eixo dominante, sem diagonal), ressaltos, grama alta,
níveis e detecção de warp. Servidor e previsão do cliente continuam chamando a mesma função. O servidor carrega a
colisão e os warps (008) dos mapas e posiciona os vizinhos pela matriz (`areas.ts`). O cliente
ganha um renderer PixiJS com resolução interna de 256×192, escala inteira, camadas
chão / entidades por y / cima, câmera presa às bordas, vizinhos carregados com antecedência e
fade nos warps.

## Technical Context

**Language/Version**: TypeScript strict; renderer Electron (Chromium), servidor em `utilityProcess` (Node)

**Primary Dependencies**: `pixi.js` 8 (nova, no `client`, prevista na constituição); `zod` (já existe)

**Storage**: leitura dos dados extraídos (`maps/`, `events/`, `sprites/`) da pasta de assets do usuário; nada gravado

**Testing**: Vitest em Node puro para `shared` e `server`; render validado manualmente pelo quickstart (princípio V isenta render)

**Target Platform**: Windows 10/11 64 bits

**Project Type**: monorepo desktop (app, client, server, shared, extractor)

**Performance Goals**: 60 fps com 4 jogadores na mesma área; passo de movimento < 0,1 ms por entidade (tick de 50 ms)

**Constraints**: simulação sem render (princípio IV); mesmo código e dados no servidor e na previsão; pixels nítidos

**Scale/Scope**: 3 mapas externos (New Bark, Route 29, Cherrygrove) e seus interiores; 1–4 jogadores

## Constitution Check

| Princípio | Status |
|---|---|
| I. Conteúdo fiel, mecânica livre | OK: mapas, colisão e warps extraídos; movimento livre (posição contínua) é a adaptação permitida, restrita às 4 direções cardinais do jogo original |
| II. Assets nunca distribuídos | OK: tudo lido da extração local; fixtures de teste são grades sintéticas |
| III. Data-driven | OK: colisão, matrizes, warps e velocidades vêm de dados |
| IV. Servidor autoritativo | OK: servidor aplica movimento e warps; cliente só prevê com `shared` |
| V. Test-first | OK: movimento, ressaltos, níveis, warps, carga de mundo e vizinhança com testes antes; render isento, validado no quickstart |
| VI. Contratos versionados | OK: `playerInput` muda (vetor + corrida) e entidade ganha `level`; `PROTOCOL_VERSION` 2 → 3 |
| VII. Progresso individual | OK: sem estado de progresso novo |
| IX. Segurança do Electron | OK: assets chegam ao renderer pelo protocolo/IPC já existente, sem `nodeIntegration` |
| X. Desempenho e simplicidade | OK: única dependência nova é o PixiJS, já prevista; colisão por grade, sem motor de física |

Sem violações. Reavaliado após a Fase 1: sem mudanças.

## Project Structure

### Documentation (this feature)

```text
specs/011-world-movement-warps/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── movement-step.md
│   └── protocol-v3.md
└── tasks.md            # /speckit-tasks
```

### Source Code

```text
packages/shared/src/game/
├── movement.ts         # passo completo: vetor, corrida, deslizamento, ressaltos, níveis, warps
├── world-map.ts        # novo: WorldMap (colisão por nível + warps + vizinhos com deslocamento)
└── protocol.ts         # playerInput { move: {x,y}, run }, entidade com level/hop

packages/shared/test/game/
├── movement.test.ts
└── world-map.test.ts

packages/server/src/
├── world-loader.ts     # novo: lê collision/*.json, warps (008), matriz; valida com zod
├── session.ts          # aplica warp (fade bloqueia input), troca de área na divisa
└── game-server.ts      # troca o "collision: () => undefined" pelo loader

packages/client/src/
├── net/prediction.ts   # usa o novo passo e WorldMap
├── input/              # novo: teclado + gamepad analógico → move/run (passo usa só o eixo dominante: 4 direções)
└── render/             # novo: PixiJS — stage 256×192, camadas, câmera, streaming de vizinhos, fade
```

**Structure Decision**: segue os pacotes existentes. Toda regra de movimento em `shared` (servidor e
previsão importam a mesma função); carga de arquivos no `server`; só desenho e input no `client`.

## Complexity Tracking

Nenhuma violação a justificar.
