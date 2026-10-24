# Implementation Plan: Servidor de jogo e protocolo

**Branch**: `010-game-server-protocol` | **Date**: 2026-10-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/010-game-server-protocol/spec.md`

## Summary

Transformar o esqueleto atual do `server` (tick loop de 20 Hz + protocolo host↔servidor) numa
simulação autoritativa com sessão de 1 a 4 jogadores, entidades genéricas, inputs numerados,
estado incremental filtrado por área, RNG com semente e gravação/replay. O protocolo de jogo
(cliente↔servidor) é definido com `zod` no `shared`. O cliente ganha um módulo puro de rede
(previsão, reconciliação, interpolação) testável sem render. A função de movimento é uma só, no
`shared`, usada pelo servidor e pela previsão do cliente. Nesta feature o caminho real é só o
local (renderer → IPC → main → processo do servidor); o transporte WebSocket para outros PCs
entra na feature 12 sobre a mesma interface `Connection`.

## Technical Context

**Language/Version**: TypeScript strict, Node.js do Electron (servidor em `utilityProcess`)

**Primary Dependencies**: `zod` (já no `shared`); nenhuma dependência nova

**Storage**: gravações de sessão em JSON (só para depuração/testes)

**Testing**: Vitest em Node puro; relógio falso (`server/test/fake-clock.ts`) e transporte em memória

**Target Platform**: Windows 10/11 64 bits

**Project Type**: monorepo desktop (app, client, server, shared)

**Performance Goals**: tick < 10 ms com 4 jogadores (orçamento de 50 ms); previsão no quadro seguinte

**Constraints**: simulação sem Electron, render ou rede (princípio IV); determinística dado semente + inputs

**Scale/Scope**: 1–4 jogadores, dezenas de entidades por área

## Constitution Check

| Princípio | Status |
|---|---|
| I. Conteúdo fiel, mecânica livre | OK: movimento livre sobre a colisão extraída (006) |
| II. Assets nunca distribuídos | OK: nada de asset novo |
| III. Data-driven | OK: colisão vem dos dados extraídos |
| IV. Servidor autoritativo | OK: cliente só envia input; simulação pura testada em Node; solo usa o mesmo servidor |
| V. Test-first | OK: sessão, protocolo, delta, filtro, RNG, replay e previsão têm testes antes do código |
| VI. Contratos versionados | OK: mensagens em `shared` com `zod`; `PROTOCOL_VERSION` 1 → 2; handshake recusa versão diferente |
| VII. Progresso individual | OK: filtro de relevância é um ponto único, hoje só por área |
| IX. Segurança do Electron | OK: renderer fala com o servidor só por IPC tipado do preload |
| X. Simplicidade | OK: sem dependências novas; delta sem ack (transporte confiável e ordenado) |

Sem violações. Reavaliado após a Fase 1: sem mudanças.

## Project Structure

### Documentation (this feature)

```text
specs/010-game-server-protocol/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/game-protocol.md
└── tasks.md             # /speckit-tasks
```

### Source Code

```text
packages/shared/src/game/
├── protocol.ts          # mensagens cliente↔servidor (zod) + parse
├── entity.ts            # Entity, EntityKind, EntityDelta
├── movement.ts          # stepMovement(entity, input, collision) — usado por servidor e cliente
├── rng.ts               # gerador com semente (sfc32)
├── recording.ts         # formato de gravação (zod)
└── index.ts             # export "./game" no package.json

packages/server/src/
├── game-server.ts       # (existente) passa a hospedar a sessão
├── tick-loop.ts         # (existente) + medição de duração
├── session.ts           # ciclo de vida, entrada/saída, timeout, aplicação de inputs por tick
├── world.ts             # entidades, ids, áreas
├── relevance.ts         # isRelevant(player, entity) — ponto único (área; flags no futuro)
├── replication.ts       # snapshot/delta por cliente contra o último enviado
├── connection.ts        # interface Connection + transporte em memória
├── recorder.ts          # grava e reproduz
└── tick-metrics.ts      # último/média/pior em janela

packages/server/test/    # session, replication, relevance, replay, perf (4 clientes)

packages/client/src/net/
├── prediction.ts        # buffer de inputs, reconciliação, suavização
├── interpolation.ts     # buffer de estados remotos, render ~100 ms no passado
└── game-connection.ts   # handshake, envio de inputs, aplicação de delta
packages/client/test/net/

packages/app/src/main/   # ponte IPC renderer ↔ processo do servidor (canal de jogo)
packages/app/src/preload/
```

**Structure Decision**: segue os pacotes existentes. Lógica pura em `shared` (contratos e
movimento) e `server` (simulação); lógica de rede do cliente em `client/src/net` sem dependência
de Svelte/Pixi; `app` só faz a ponte.

## Complexity Tracking

Nenhuma violação a justificar.
