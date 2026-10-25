# Implementation Plan: Progressão dos Pokémon

**Branch**: `016-pokemon-progression` | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/016-pokemon-progression/spec.md`

## Summary

Quando um oponente cai, o servidor credita XP (fórmula Gen 4) e EVs (`evYield` da espécie) a cada
participante do jogador e grava a experiência no membro da equipe. O nível sai da tabela
`growth-rates.json` já extraída, e não de fórmula. Os níveis ganhos, os golpes do learnset e as
evoluções `level` entram numa fila de progressão por jogador. Enquanto `companions.inCombat()` for
verdadeiro, a fila só cresce. Quando o modo volta para `walk`, o servidor resolve os itens
automáticos (subida de nível, golpe com vaga) e manda ao cliente um prompt de cada vez (golpe com 4
conhecidos, evolução), esperando a resposta. Os stats usam `computeStats` (spec 13), agora com IVs,
EVs e natureza guardados no membro. A amizade ganha regras de subida de nível e desmaio. O save vai
de 3 para 4, com experiência, IVs, EVs, natureza e a fila pendente. O protocolo vai de 7 para 8,
com eventos de progressão e a resposta do jogador.

## Technical Context

**Language/Version**: TypeScript strict; Node.js do Electron (servidor em `utilityProcess`)

**Primary Dependencies**: zod, three.js, Svelte 5 (já usados). Nenhuma nova.

**Storage**: save JSON v4 (migração 3 → 4); `content/combat/` não muda

**Testing**: vitest em Node puro (shared, server); animação de evolução verificada à mão

**Target Platform**: Windows 10/11 64 bits

**Project Type**: desktop-app (Electron, monorepo)

**Performance Goals**: crédito de XP O(participantes) por queda; nada roda por tick fora do combate além de checar a fila

**Constraints**: servidor autoritativo; nenhuma tela de decisão com combate ativo; testes com
fixtures sintéticos (princípio II), incluindo as curvas como números de referência públicos

**Scale/Scope**: até 4 jogadores; até 6 membros por equipe; níveis 1–100

## Constitution Check

| Princípio | Status | Nota |
|-----------|--------|------|
| I Conteúdo fiel, mecânica livre | ✅ | Fórmula de XP, EVs, stats, curvas, learnsets, evoluções e amizade seguem a Gen 4. Adiar decisões para o fim do combate e a definição de participante em tempo real são mecânica nova e vão para `docs/balance-log.md`. |
| II Assets nunca distribuídos | ✅ | Os dados vêm da extração em runtime; os fixtures de teste são valores de referência numéricos. |
| III Data-driven | ✅ | Curvas, `baseExperience`, `evYield`, `baseFriendship`, learnsets e evoluções vêm dos dados extraídos. As constantes da fórmula original (1,5×, limites de EV, faixas de amizade) são regra Gen 4 em `shared/progression`, não balanceamento. |
| IV Servidor autoritativo | ✅ | XP, EVs, nível, stats e evolução só no servidor; o cliente só responde aos prompts. |
| V Test-first | ✅ | XP, nível pela curva, stats, limites de EV, amizade, montagem da fila e migração com teste antes. |
| VI Contratos versionados | ✅ | `PROTOCOL_VERSION` 7 → 8; `SAVE_SCHEMA_VERSION` 3 → 4 com migração. |
| VII Progresso individual | ✅ | A fila e a equipe são de cada jogador; os outros veem só a espécie e o nível novos. |
| VIII Saves do jogador | ✅ | A fila pendente vai no save do jogador e volta com ele em outro host. |
| X Simplicidade | ✅ | Funções puras em `shared/progression`, um módulo novo no servidor, nenhuma dependência nova. |

Sem violações. Re-checado após Phase 1: sem mudanças.

## Project Structure

### Documentation (this feature)

```text
specs/016-pokemon-progression/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── game-protocol-v8.md
│   └── save-v4.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/progression/   # NOVO: lógica pura
├── experience.ts               # fórmula Gen 4 de XP, nível pela curva
├── evs.ts                      # soma de EVs com limites 255/510
├── friendship.ts               # ganho por nível, perda por desmaio
├── queue.ts                    # monta a fila a partir de nível antigo → novo (golpes, evolução level)
└── index.ts
packages/shared/src/save/       # schema v4 + migração 3 → 4
packages/shared/src/game/protocol.ts, protocol-version.ts   # v8

packages/server/src/
├── progression.ts              # NOVO: crédito na queda, resolução da fila fora do combate
├── companion.ts                # expõe os membros ativos no combate (participantes) e o fim do combate
├── wild.ts, capture.ts         # chamam o crédito na queda; capturado nasce com IVs/natureza/XP
└── session.ts                  # recebe as respostas aos prompts

packages/client/src/
├── ProgressionPrompt.svelte    # NOVO: subida de nível, escolha de golpe, evolução cancelável
└── render/combat-fx.ts         # animação de evolução

packages/shared/test/progression/
packages/server/test/progression.test.ts
docs/balance-log.md
```

**Structure Decision**: segue o monorepo; nenhum pacote novo. Lógica pura em `shared/progression`,
ao lado de `shared/combat` e `shared/wild`, e estado no `server`.

## Complexity Tracking

Nenhuma violação a justificar.
