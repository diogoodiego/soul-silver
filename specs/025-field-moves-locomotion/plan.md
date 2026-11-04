# Implementation Plan: Golpes de campo e locomoção

**Branch**: `025-field-moves-locomotion` | **Date**: 2026-11-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/025-field-moves-locomotion/spec.md`

## Summary

O mundo já tem tudo o que os golpes de campo consomem (tabelas de surf, varas, Rock Smash e Headbutt extraídas pelo spec 015, interpretador de scripts, visibilidade por jogador), mas falta o estado do jogador e a regra que liga os dois. O plano:

1. **Regras em dados.** `content/field/moves.json` (escrito à mão, schema zod) liga cada golpe de campo ao tipo de obstáculo, ao golpe de combate, à insígnia (copiada de `field_move.c` da decomp, [research R1](research.md)), ao diálogo/pergunta e ao efeito. Função pura `canUseFieldMove(rules, badgeSet, party, obstacle)` em `shared`.
2. **Obstáculos por jogador.** Objetos de mapa de obstáculo (árvore, rocha, Strength, redemoinho, cachoeira, parede) já são objetos com script no original; o servidor guarda por sessão um conjunto de obstáculos removidos do mapa atual. O conjunto zera ao sair do mapa (reaparece, como no original) e nunca é replicado a outros jogadores; a colisão e a visibilidade enviadas a cada cliente descontam só os removidos daquele jogador ([research R2](research.md)).
3. **Insígnias como conjunto.** O save guarda só uma contagem (`badges`); golpes exigem a insígnia específica. Save v8 → v9: `badges` vira `badgeSet` (máscara de 16 bits; migração liga os N primeiros bits, a ordem em que Johto é ganha), mais `flyPoints` (áreas visitadas). Consumidores da contagem (loja, perda de dinheiro) passam a usar `badgeCount(set)`.
4. **Locomoção.** `content/species/locomotion.json` (493 espécies, schema com `z.enum`, teste de cobertura total). `Player.mode` ganha `walk | run | bike | surf | fish`; o servidor valida cada transição (bicicleta recusada em interior; surf só da borda da água, com insígnia e golpe; companheiro vai para a bola reusando o recolhimento já existente do spec 014).
5. **Surf e pesca.** Encontros de água reusam o spawn de selvagens do spec 015 com a tabela `surf`/`oldRod`/`goodRod`/`superRod` do mapa e o mesmo sorteio com semente. Pesca é uma máquina de estados no servidor (`idle → casting → waiting → bite(janela) → hooked|escaped`), com janela de reação em `content/field/fishing.json` e chance de fisgar `base + k·amizade` ([research R4](research.md)). O selvagem fisgado nasce no tile de água adjacente. Lançar durante o surf passa por `launchAllowed(locomotion, mode)`; o seletor recebe a lista de permitidos.
6. **Fly, Flash, fuga.** Fly lê `flyPoints` e a tabela de pontos de voo extraída; servidor valida o destino contra `flyPoints`. Flash usa o atributo de escuridão do cabeçalho do mapa (extraído) e o raio de visão no cliente (render) com um estado `lit` por jogador. Dig/Teleport/Escape Rope reusam o warp de respawn/entrada de caverna.
7. **Desenvolvimento.** Comandos `debugGiveBadge`, `debugTeachMove`, `debugGiveItem` (e o `debugWarp` que já existe) aceitos só com `devTools` e o depurador ligado; em produção são descartados e registrados.
8. **Contratos.** Protocolo 18 → 19, save 8 → 9, dois arquivos de dados novos.

## Technical Context

**Language/Version**: TypeScript strict; Node.js do Electron

**Primary Dependencies**: zod (já usado). Nenhuma nova.

**Storage**: save v9 (`badgeSet`, `flyPoints`); `content/field/moves.json`, `fishing.json`, `content/species/locomotion.json`; estágio `events` do extrator ganha `fly-points.json` (insígnias vão em `moves.json`, escuridão vem de `map-headers.json`)

**Testing**: vitest com fixtures sintéticas (shared, server, extractor, save); sonda de campo local com a ROM real em `packages/app/golden/` (fora da CI, exige `SOULSILVER_ROM`); driver da skill `run-soulsilver` para as capturas

**Target Platform**: Windows 10/11 64 bits

**Project Type**: desktop-app (Electron, monorepo)

**Performance Goals**: sem regressão do tick de 20 Hz; estado de obstáculos removidos é um `Set<string>` por sessão; Flash é efeito de render, sem custo no tick

**Constraints**: servidor autoritativo; nada da ROM no repositório; fixtures sintéticas; estado por jogador (VII)

**Scale/Scope**: 13 golpes/itens de campo, 7 tipos de obstáculo, 4 modos de água/pesca, 493 espécies, 4 mensagens de dev

## Constitution Check

| Princípio | Conformidade |
|-----------|--------------|
| I. Conteúdo fiel | OK. Insígnias, diálogos, tabelas de encontro, pontos de voo e escuridão vêm da ROM. Desvios: chance de fisgar e janela de reação em tempo real, e Headbutt/Rock Smash sorteados no uso, vão para `docs/balance-log.md` (tarefa). |
| II. Assets nunca distribuídos | OK. Dados novos extraídos ficam na pasta do usuário; JSONs de regras escritos à mão não contêm dados da ROM; a sonda lê a ROM por variável de ambiente e fica fora da CI. |
| III. Data-driven | OK. Regras de golpes, pesca e classe de locomoção em arquivos com schema zod validado no carregamento. |
| IV. Servidor autoritativo | OK. Uso de golpe, modo, fisgada e destino do Fly são decididos e validados no servidor; o cliente só pede e desenha. |
| V. Test-first | Aplicável (regras, pesca, migração, protocolo, servidor, extrator). Testes vermelhos primeiro. Camada 3 (sonda) e camada 4 (8 capturas) listadas no spec. |
| VI. Contratos versionados | Save 8 → 9 com migração testada; protocolo 18 → 19; schemas em `shared`. |
| VII. Progresso individual | OK. Obstáculos removidos, modo, insígnias, pontos de voo e Flash são por jogador; selvagens da água continuam compartilhados. |
| VIII. Saves locais | OK. Só dois campos novos; gravação atômica existente. |
| IX. Segurança do Electron | Não afetado. Comandos de dev não passam pelo IPC; viajam no protocolo e só valem com `devTools` e o depurador ligado. |
| X. Desempenho e simplicidade | Reusa spawn, recolhimento do companheiro, interpretador e visibilidade. Sem dependência nova. |
| XI. Entrega incremental | Marcos: US1 (obstáculos) → US2 (surf) → US3 (pesca) → US4 (bike/Fly/Flash). Cada um jogável. |

Reavaliação pós-design: sem violações; nenhuma entrada em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/025-field-moves-locomotion/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── protocol-v19.md
│   └── save-v9.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/
├── field/               # novo: moves.ts (regras puras), fishing.ts, locomotion.ts, schemas.ts
├── save/                # schema.ts (v9), migrate.ts, badges helpers
├── game/protocol.ts     # mensagens field-*, debug*; mode no estado do jogador
└── protocol-version.ts  # 19
packages/extractor/src/events/   # fly-points.ts (pontos de voo) no estágio events
packages/server/src/
├── field.ts             # uso de golpe, obstáculos removidos por sessão, modos, Fly
├── fishing.ts           # máquina de estados da pesca
├── wild.ts              # spawn de água (surf/pesca) reusando as tabelas
├── scripts.ts           # hasBadge por conjunto, giveBadge
└── scripts.ts           # debugGiveBadge, debugTeachMove, debugGiveItem (devTools)
packages/app/golden/    # sonda de campo (local), ao lado de campaign.golden.ts
packages/client/src/     # prompt de uso, mapa do Fly, seletor com lançáveis, render de Flash/surf/bike/pesca
content/field/           # moves.json, fishing.json (escritos à mão)
content/species/         # locomotion.json
```

**Structure Decision**: segue o monorepo existente; lógica pura em `shared/field`, orquestração por sessão em `server`.

## Complexity Tracking

Sem violações a justificar.
