# Implementation Plan: Pokémon companheiro e regras do combate no mundo

**Branch**: `014-companion-combat-rules` | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/014-companion-combat-rules/spec.md`

## Summary

O companheiro vira uma entidade `pokemon` do servidor, dona de um jogador, que percorre um rastro
(fila de posições do treinador gravada no tick). Como só repete posições que o treinador já ocupou,
não precisa de colisão própria; ressalto e warp entram no rastro como passos marcados. O estado do
jogador ganha um modo (`walk` | `combat`): em combate o input passa a mover o Pokémon (8 direções,
combate do spec 13) e o treinador fica parado e fora do alcance dos golpes. O save sobe para v2
com equipe mínima, dinheiro, insígnias e ponto de reaparição; o blackout e a perda de dinheiro da
Gen 4 são funções puras em `shared`. Regras de seguimento, tamanho, locais restritos, reações,
raio, troca e perseguição ficam em `content/companion/*.json` com schema zod. Protocolo 5 → 6:
bits de botão para combate, recolher e interagir, mensagem de troca e mensagens de reação,
desmaio e blackout.

## Technical Context

**Language/Version**: TypeScript strict; Node.js do Electron (servidor em `utilityProcess`)

**Primary Dependencies**: zod, three.js, Svelte 5 (já usados). Nenhuma nova.

**Storage**: `content/companion/*.json` versionado no repo; save JSON v2 (migração 1 → 2)

**Testing**: vitest em Node puro (shared, server); render e diálogo verificados à mão

**Target Platform**: Windows 10/11 64 bits

**Project Type**: desktop-app (Electron, monorepo)

**Performance Goals**: rastro O(1) por tick por jogador; botão de combate → controle ≤ 500 ms
(≤ 2 ticks de servidor + 1 RTT em LAN)

**Constraints**: servidor autoritativo; nenhum número de regra fixo no código; testes com fixtures
sintéticos (princípio II)

**Scale/Scope**: até 4 jogadores e 4 companheiros por partida; ~40 regras de reação iniciais

## Constitution Check

| Princípio | Status | Nota |
|-----------|--------|------|
| I Conteúdo fiel, mecânica livre | ✅ | Reações vêm do banco de texto extraído; perda de dinheiro segue a Gen 4. Raio, cooldown de troca e perseguição são mecânica nova e entram no `docs/balance-log.md`. |
| II Assets nunca distribuídos | ✅ | `content/companion/` só guarda ids e parâmetros; textos ficam na extração. |
| III Data-driven | ✅ | Seguimento, tamanho, locais restritos, reações, raio, troca, perseguição e tabela de dinheiro em JSON validado. |
| IV Servidor autoritativo | ✅ | Rastro, modo de combate, contenção no raio, troca, desmaio e blackout só no servidor. |
| V Test-first | ✅ | Rastro, escolha do companheiro, troca, blackout, perda de dinheiro, contenção e migração do save com teste antes. |
| VI Contratos versionados | ✅ | `PROTOCOL_VERSION` 5 → 6; `SAVE_SCHEMA_VERSION` 1 → 2 com migração. |
| VII Progresso individual | ✅ | Equipe, dinheiro, insígnias e reaparição ficam no save de cada jogador. |
| X Simplicidade | ✅ | Rastro sem pathfinding; sem dependência nova; perseguição só como parâmetro para a IA do spec 15. |

Sem violações. Re-checado após Phase 1: sem mudanças.

## Project Structure

### Documentation (this feature)

```text
specs/014-companion-combat-rules/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── companion-data.md
│   ├── game-protocol-v6.md
│   └── save-v2.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
content/companion/              # NOVO: dados escritos à mão
├── follow.json                 # distâncias, limiar de tamanho, locais restritos
├── reactions.json              # regras de reação → emoção + texto
└── battle-rules.json           # raio, troca, perseguição, tabela de dinheiro, casa

packages/shared/src/companion/  # NOVO: lógica pura e schemas
├── schemas.ts
├── trail.ts                    # fila do rastro, passo do companheiro, reaparição
├── lead.ts                     # primeiro não desmaiado
├── size.ts                     # grande/pequeno pelo frame de overworld
├── reactions.ts                # escolha de reação por contexto
├── blackout.ts                 # perda de dinheiro Gen 4, ponto de reaparição
└── index.ts
packages/shared/src/save/       # schema v2 + migração 1 → 2
packages/shared/src/game/protocol.ts, protocol-version.ts   # v6

packages/server/src/
├── companion.ts                # NOVO: entidade do companheiro e rastro por jogador
├── battle-mode.ts              # NOVO: walk/combat, raio, troca, desmaio, blackout
├── companion-loader.ts         # NOVO
└── session.ts, combat.ts       # integra ao tick; a equipe vira fonte dos combatentes

packages/client/src/
├── input/input.ts              # ações combate/recolher/interagir/seletor (remapeáveis)
├── render/camera.ts            # segue a entidade controlada
├── render/game-renderer.ts     # companheiro, bola, balão de emoção, marca "em combate"
├── SwapPicker.svelte           # NOVO: seletor rápido
└── ReactionDialog.svelte       # NOVO: caixa de diálogo da reação

packages/shared/test/companion/
packages/server/test/companion.test.ts, battle-mode.test.ts
docs/balance-log.md
```

**Structure Decision**: segue o monorepo; nenhum pacote novo. Lógica pura em `shared`, estado no
`server`, dados em `content/companion/` ao lado de `content/combat/`.

## Complexity Tracking

Nenhuma violação a justificar.
