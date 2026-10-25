# Implementation Plan: Pokémon selvagens e captura

**Branch**: `015-wild-pokemon-capture` | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/015-wild-pokemon-capture/spec.md`

## Summary

O servidor ganha um spawner por área: a cada intervalo, se a área está abaixo do limite, sorteia um
slot da tabela `grass[horário]` do encounter do mapa (spec 8) e posiciona o selvagem numa célula
`tallGrass` (ou `free` em mapa `areaType: "cave"`) fora da visão de todos os jogadores. O selvagem é
uma entidade `pokemon` com combatente `owner: "wild"` (spec 13), golpes tirados do learnset até o
nível e uma IA de estados por temperamento. Spawn, IA, captura e Pokédex são funções puras em
`shared/wild`, com RNG semeado para os testes estatísticos. A captura é um projétil do combate com
a fórmula da Gen 4; o servidor resolve quem acertou primeiro e sorteia as balançadas. Save 2 → 3
com bolsa mínima, Pokédex, armazenamento temporário e `shiny` no membro da equipe. Protocolo 6 → 7
com bit de arremesso, item de bola escolhido e eventos de captura.

## Technical Context

**Language/Version**: TypeScript strict; Node.js do Electron (servidor em `utilityProcess`)

**Primary Dependencies**: zod, three.js, Svelte 5 (já usados). Nenhuma nova.

**Storage**: `content/wild/*.json` versionado no repo; save JSON v3 (migração 2 → 3)

**Testing**: vitest em Node puro (shared, server); render do shiny e balançadas verificados à mão

**Target Platform**: Windows 10/11 64 bits

**Project Type**: desktop-app (Electron, monorepo)

**Performance Goals**: spawner e IA O(selvagens + jogadores) por tick; ≤ 1 ms por tick com 4
jogadores e 40 selvagens por área ativa

**Constraints**: servidor autoritativo; nenhum número de regra fixo no código; testes com fixtures
sintéticos (princípio II), inclusive a tabela da Route 29 copiada como fixture de ids e taxas

**Scale/Scope**: até 4 jogadores; limite padrão de 6 selvagens por área; ~25 bolas de HGSS

## Constitution Check

| Princípio | Status | Nota |
|-----------|--------|------|
| I Conteúdo fiel, mecânica livre | ✅ | Tabelas, faixas de horário, chance de shiny e fórmula de captura seguem a Gen 4. Temperamentos, limites, despawn e a adaptação de "turnos" (Quick/Timer Ball) a segundos são mecânica nova e vão para `docs/balance-log.md`. |
| II Assets nunca distribuídos | ✅ | `content/wild/` só guarda ids e parâmetros; fixtures de teste são números, não dados da ROM. |
| III Data-driven | ✅ | Limites, raios, tempos, temperamentos e modificadores de bola em JSON validado por zod. |
| IV Servidor autoritativo | ✅ | Spawn, IA, acerto da bola, sorteio e destino do capturado só no servidor. |
| V Test-first | ✅ | Sorteio de slot (qui-quadrado), horário, posição fora da visão, fórmula de captura por modificador, prioridade do acerto e migração do save com teste antes. |
| VI Contratos versionados | ✅ | `PROTOCOL_VERSION` 6 → 7; `SAVE_SCHEMA_VERSION` 2 → 3 com migração. |
| VII Progresso individual | ✅ | Selvagens compartilhados; bolsa, Pokédex e armazenamento no save de cada jogador. |
| X Simplicidade | ✅ | IA por máquina de estados simples, sem pathfinding (passo direto com colisão do mapa); sem dependência nova. |

Sem violações. Re-checado após Phase 1: sem mudanças.

## Project Structure

### Documentation (this feature)

```text
specs/015-wild-pokemon-capture/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── wild-data.md
│   ├── game-protocol-v7.md
│   └── save-v3.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
content/wild/                   # NOVO: dados escritos à mão
├── spawn.json                  # limite por área, intervalo, despawn, raio de retorno, margem de visão
├── temperaments.json           # padrão + temperamento e raios por espécie
└── balls.json                  # modificador e condição por item de bola

packages/shared/src/wild/       # NOVO: lógica pura e schemas
├── schemas.ts
├── time-of-day.ts              # hora local → morning | day | night
├── spawn.ts                    # sorteio de slot e nível, shiny, escolha de célula fora da visão
├── moves.ts                    # últimos 4 golpes do learnset até o nível
├── temperament.ts              # máquina de estados da IA
├── capture.ts                  # fórmula Gen 4, balançadas, modificador da bola
├── pokedex.ts                  # vistos/capturados
└── index.ts
packages/shared/src/save/       # schema v3 + migração 2 → 3
packages/shared/src/game/protocol.ts, protocol-version.ts   # v7

packages/server/src/
├── wild.ts                     # NOVO: spawner por área, IA no tick, despawn
├── capture.ts                  # NOVO: bola como projétil, fila de captura, destino
├── wild-loader.ts              # NOVO
└── session.ts, combat.ts       # integra ao tick; Pokédex "visto" via relevância

packages/client/src/
├── input/input.ts              # ação arremessar + troca de bola (remapeáveis)
├── render/game-renderer.ts     # selvagens, brilho shiny, bola, balançadas
└── render/combat-fx.ts         # partículas do brilho e da captura

packages/shared/test/wild/
packages/server/test/wild.test.ts, capture.test.ts
docs/balance-log.md
```

**Structure Decision**: segue o monorepo; nenhum pacote novo. Lógica pura em `shared/wild`, estado
no `server`, dados em `content/wild/` ao lado de `content/combat/` e `content/companion/`.

## Complexity Tracking

Nenhuma violação a justificar.
