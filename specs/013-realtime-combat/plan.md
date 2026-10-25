# Implementation Plan: Combate em tempo real

**Branch**: `013-realtime-combat` | **Date**: 2026-10-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/013-realtime-combat/spec.md`

## Summary

Combate por controle direto dentro do tick de 20 Hz do servidor existente. A lógica pura vive em
`shared/combat`: fórmula de dano da Gen 4 (inteira, com o RNG determinístico do servidor), tabela
de tipos lida do `type-chart.json` extraído, cálculo de stats, estágios, status em ticks,
cooldown derivado de poder/PP, escala por Speed e geometria de hitbox 2D (círculo, cápsula, arco).
O comportamento dos golpes vem de dados escritos à mão (`content/combat/`: arquétipos, mapeamentos,
status, constantes), validados por zod no carregamento. O servidor cria combatentes como entidades
`pokemon`, resolve golpes e emite eventos de acerto; o cliente envia mira e botões de golpe
(protocolo 4 → 5) e desenha feedback (piscada, knockback, número, texto). Uma arena de
desenvolvimento, só em builds de dev, escolhe dois Pokémon e mostra HUD de depuração.

## Technical Context

**Language/Version**: TypeScript strict; Node.js do Electron (servidor em `utilityProcess`)

**Primary Dependencies**: zod (já usado), three.js (render), Svelte 5 (HUD da arena). Nenhuma nova.

**Storage**: dados de combate em JSON versionado no repositório (`content/combat/*.json`); dados
de jogo extraídos (`moves`, `species`, `type-chart`, `learnsets`, `encounters`) no diretório da
extração

**Testing**: vitest em Node puro (shared, server); render e HUD verificados à mão

**Target Platform**: Windows 10/11 64 bits

**Project Type**: desktop-app (Electron, monorepo)

**Performance Goals**: resolução de golpes e status ≤ 1 ms por tick com 8 combatentes e 32
hitboxes ativas; feedback em ≤ 150 ms em LAN (SC-005)

**Constraints**: servidor autoritativo (cliente só manda intenções); dados de combate ≤ 1 MB;
nenhum número de combate fixo no código (princípio III)

**Scale/Scope**: ~200 golpes mapeados (rotas 29–31 + iniciais), 9 arquétipos base, 7 status

## Constitution Check

| Princípio | Status | Nota |
|-----------|--------|------|
| I Conteúdo fiel, mecânica livre | ✅ | Stats, tipos, poder, PP e tabela de tipos vêm da extração; cooldowns, durações e limites de Speed entram no `docs/balance-log.md`. |
| II Assets nunca distribuídos | ✅ | `content/combat/` só tem parâmetros próprios e ids de golpe; nada da ROM. |
| III Data-driven | ✅ | Arquétipos, mapeamentos, status e constantes em JSON com schema e erro com arquivo/campo. |
| IV Servidor autoritativo | ✅ | Acerto, dano, status e knockback só no servidor; simulação em `shared`/`server`, sem render. |
| V Test-first | ✅ | Fórmula, tabela 17×17 (+ ???), stats, estágios, status, cooldown, hitbox, cobertura de mapeamento e resolução no servidor com teste antes. Render e HUD à mão. |
| VI Contratos versionados | ✅ | Schemas de combate e mensagens em `shared`; `PROTOCOL_VERSION` 4 → 5. |
| VII Progresso individual | ✅ | Filtro por dono: Pokémon de jogadores diferentes não se ferem fora do PvP. |
| X Simplicidade | ✅ | Sem motor de física; geometria 2D própria (~3 formas). Sem dependência nova. |

Sem violações. Re-checado após Phase 1: sem mudanças.

## Project Structure

### Documentation (this feature)

```text
specs/013-realtime-combat/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── combat-data.md
│   └── game-protocol-v5.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
content/combat/                 # NOVO: dados escritos à mão
├── archetypes.json
├── moves.json                  # mapeamentos por id de golpe
├── statuses.json
└── tuning.json                 # cooldown, Speed, crítico, knockback

packages/shared/src/combat/     # NOVO: lógica pura e schemas
├── schemas.ts                  # zod dos 4 arquivos + parse com erro arquivo/campo
├── damage.ts                   # fórmula Gen 4
├── types.ts                    # efetividade a partir do type-chart extraído
├── stats.ts                    # stats por nível, estágios
├── cooldown.ts                 # base por poder/PP, escala por Speed
├── status.ts                   # aplicar, tick, expirar
├── hitbox.ts                   # círculo, cápsula, arco; sobreposição
└── index.ts
packages/shared/src/game/protocol.ts   # input com aim; mensagem combat-event; v5
packages/shared/src/protocol-version.ts

packages/server/src/
├── combat.ts                   # NOVO: combatentes, golpes ativos, resolução por tick
├── combat-loader.ts            # NOVO: carrega content/combat + dados extraídos
├── arena.ts                    # NOVO: sessão de arena (dev)
└── world.ts, session.ts        # integra combate ao tick e ao input

packages/client/src/
├── input/input.ts              # mira (mouse/analógico direito) e 4 atalhos
├── render/combat-fx.ts         # NOVO: piscada, knockback, números, texto
└── ArenaHud.svelte             # NOVO: escolha de Pokémon + HP/cooldowns/status

packages/shared/test/combat/    # testes da lógica pura
packages/server/test/combat.test.ts
docs/balance-log.md
```

**Structure Decision**: segue o monorepo; nenhum pacote novo. Lógica pura em `shared` (reusável
pela futura IA do spec 15 e pelo PvP do spec 25); estado e tick no `server`; dados à mão em
`content/` na raiz, ao lado do código e fora da extração.

## Complexity Tracking

Nenhuma violação a justificar.
