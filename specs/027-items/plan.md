# Implementation Plan: Itens

**Branch**: `027-items` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/027-items/spec.md`

## Summary

Hoje existe `server/items.ts` (só `useItem` de cura fora de combate, recusado em combate), `shared/game/items.ts` (`hpRestore`), a mochila plana `bag: {item,count}[]` no save, `content/wild/balls.json` (modificadores de bola, já com as bolas de apricorn), os handlers de script `GiveItem/TakeItem/HasItem/HasSpaceForItem`, `learn-answer`/`evolve-answer` (só por nível) e o relógio de sessão `server/clock.ts` (spec 026). O membro do grupo no save **não tem item segurado nem PP Ups**. O plano:

1. **Uma porta só para a mochila.** `shared/items/bag.ts` (puro: `addItem`, `removeItem`, `canAdd`, bolso do item, limites por bolso e pilha). Script, loja, PC, chão, Kurt e companheiro passam por ela; é onde "toda alteração é validada no servidor" (FR-016) fica num lugar só ([R1](research.md)).
2. **Efeitos em dados, por arquétipo.** `content/items/effects.json` (item → arquétipo + parâmetros) e `content/items/tuning.json` (tempo de uso e recarga por arquétipo, com exceção por item). Arquétipos: `heal`, `revive`, `status-cure`, `pp-ether`, `pp-up`, `battle-stat`, `repel`, `field`, `teach`, `evolve`, `held`. Cura e status reaproveitam os bytes de `partyUse` já extraídos; TM/HM e pedras saem do learnset e das evoluções extraídas, sem tabela à mão ([R2](research.md)).
3. **Uso em combate como ação do treinador.** Novo estado `TrainerAction` em `Combat` (`item`, `target`, `endsAtTick`) e recarga própria do treinador; o Pokémon continua sofrendo dano, o uso só é cancelado se ele desmaiar ([R3](research.md)). Mensagem `use-item-combat`; o seletor rápido no cliente só envia pedidos.
4. **PP vira cooldown.** `ppUps` por golpe no membro; Ether/Elixir encurtam a recarga restante, PP Up/PP Max reduzem a recarga base (`÷ (1 + 0,2·n)`, a mesma razão original de +20% de PP por nível). Quatro entradas no `docs/balance-log.md` ([R4](research.md)).
5. **Itens segurados.** `content/items/held.json` mapeia o `holdEffect.id` extraído para um arquétipo de gatilho (`hp-threshold`, `status`, `regen`, `damage-mod`, `survive`, `speed-mod`, `once-per-fight`), com ganchos em `combat.ts` nos pontos já existentes (cálculo de dano, pós-dano, aplicação de status, tick). Dar e tirar passam por `set-held` ([R5](research.md)).
6. **Mundo.** Árvores e Kurt em `server/trees.ts` e `server/kurt.ts`, sobre o relógio da sessão, com estado por jogador no save. Itens do chão e escondidos vêm do estágio de eventos do extrator, com flags por jogador que já existem. `server/dowsing.ts` calcula o item escondido mais próximo e envia direção e proximidade. Achados do companheiro em `server/finds.ts` ([R6, R7, R8](research.md)).
7. **Repel.** Efeito por jogador no servidor: `wild.ts` reduz o teto de spawns perto dele e a IA do selvagem de nível menor que o do companheiro fica passiva ([R9](research.md)).
8. **Cobertura.** `npm run items:coverage` (`scripts/items-coverage.ts`): lista todo item sem arquétipo mapeado e sai com falha se algum item obtível até Violet City estiver na lista; o conjunto obtível vem dos eventos, lojas e presentes extraídos ([R10](research.md)).
9. **Contratos.** Protocolo 20 → 21, save 10 → 11, quatro arquivos de dados novos e extensão de dois estágios do extrator.

**Riscos maiores (não resolvidos):** (a) onde ficam na ROM os dados de crescimento de berry, a tabela de achados do companheiro e os itens escondidos já extraídos; a primeira tarefa é uma sondagem ([R6–R8](research.md)); se alguma faltar, o escopo daquela história cai para dados escritos à mão com a origem citada, ou é cortado. (b) O número de itens com efeito de combate a mapear até Violet City; o relatório de cobertura mede isso antes de qualquer implementação em massa.

## Technical Context

**Language/Version**: TypeScript strict; Node.js do Electron

**Primary Dependencies**: zod (já usado). Nenhuma nova.

**Storage**: save v11 (`ppUps` e `held` por membro; `trees`, `kurt` e `repel` por jogador); `content/items/{effects,tuning,held,pockets}.json` escritos à mão; `content/companion/finds.json` (extraído ou à mão, conforme R7); extensão dos estágios `events` (itens do chão e escondidos) e `game-data` (crescimento de berries)

**Testing**: vitest com fixtures sintéticas (shared, server, extractor, save, client); extensão do caminho dourado em `packages/app/golden/` (local, `SOULSILVER_ROM`); `npm run items:coverage`; driver da skill `run-soulsilver` para as 6 capturas

**Target Platform**: Windows 10/11 64 bits

**Project Type**: desktop-app (Electron, monorepo)

**Performance Goals**: sem regressão do tick de 20 Hz. Itens segurados rodam por gancho de evento, não por varredura; a regeneração (Leftovers) soma a cada 1 s de relógio da luta. O Dowsing calcula no máximo a cada 200 ms por jogador e só enquanto o aparelho está equipado ativo.

**Constraints**: servidor autoritativo; nada da ROM no repositório; fixtures sintéticas; estado por jogador (VII); relógio da sessão injetável

**Scale/Scope**: 8 bolsos; centenas de itens extraídos (a cobertura conta quantos têm efeito); 11 arquétipos de uso; ~20 arquétipos de gatilho de segurado; 3 mensagens novas

## Constitution Check

| Princípio | Conformidade |
|-----------|--------------|
| I. Conteúdo fiel | OK: itens, preços, limites, learnsets, evoluções, modificadores de bola, tabelas de achados e itens do mundo vêm da ROM. Desvios a registrar em `docs/balance-log.md`: Ether, Elixir, PP Up, PP Max (PP → cooldown), duração do Repel (passos → tempo), efeito do Repel (sem encontro aleatório), tempo de uso e recarga de cada arquétipo (não existem no original), efeito de segurados que dependem de turno. |
| II. Assets nunca distribuídos | OK. `effects.json`, `tuning.json`, `held.json` e `pockets.json` só têm números e ids; nomes e textos continuam extraídos. Camada 3 lê a ROM por variável de ambiente, fora da CI. |
| III. Data-driven | OK. Efeitos, tempos, recargas, gatilhos de segurados, limites de bolso e prazos em arquivos com schema zod (erro com arquivo, campo e problema). |
| IV. Servidor autoritativo | OK. Uso, cura, consumo de berry, ensino, evolução, colheita, prazo do Kurt, Dowsing e achado são decididos no servidor; o cliente envia pedidos e desenha o estado. |
| V. Test-first | Aplicável (bag, arquétipos, ação do treinador, PP, segurados, árvores, Kurt, Repel, achados, migração, protocolo, extrator, cobertura). Testes vermelhos primeiro. UI (seletor rápido, mochila, Dowsing) isenta, verificada na camada 4/5. Camadas 3, 4 e 5 listadas no spec. |
| VI. Contratos versionados | Save 10 → 11 com migração testada; protocolo 20 → 21; schemas em `shared`. |
| VII. Progresso individual | OK. Mochila, segurados, árvores, Kurt, Repel e coletas por jogador; selvagens continuam compartilhados, e o Repel só afeta o teto de spawns e a IA em relação ao jogador que o usa. |
| VIII. Saves locais | OK. Campos novos no save do jogador; gravação atômica existente. |
| IX. Segurança do Electron | Não afetado; mensagens novas só no protocolo de jogo. |
| X. Desempenho e simplicidade | Sem dependência nova; reusa `partyUse`, `balls.json`, relógio de sessão, flags e o formato de arquétipos. |
| XI. Entrega incremental | Marcos: US8 (mochila e cobertura) → US1 (combate) → US3 (segurados) → US2 (PP) → US4 (TM/pedras) → US6 (chão e Dowsing) → US5 (árvores e Kurt) → US7 (Repel). A mochila vem primeiro porque tudo passa por ela; o chão antes das árvores porque o caminho dourado até Violet City precisa dele. |

Reavaliação pós-design: sem violações; nenhuma entrada em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/027-items/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── protocol-v21.md
│   └── save-v11.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/
├── items/               # novo: bag.ts (porta única), effects.ts (arquétipos), held.ts (gatilhos), schemas.ts
├── game/items.ts        # hpRestore + leitura de partyUse (status, PP, revive)
├── game/protocol.ts     # use-item-combat, set-held, plant-tree; estende use-item
├── save/                # schema.ts (v11), migrate.ts
└── protocol-version.ts  # 21
packages/extractor/src/
├── events/              # itens do chão e escondidos (se a sondagem R6 achar lacuna)
└── data/                # crescimento de berry (se existir na ROM, R7)
packages/server/src/
├── items.ts             # useItem passa a despachar por arquétipo
├── bag.ts               # liga shared/items/bag ao Save e aos hosts de script, loja e PC
├── combat.ts            # TrainerAction, recarga do treinador, ganchos de segurados
├── held.ts              # gatilhos de segurados
├── trees.ts, kurt.ts    # árvores e encomendas, sobre o relógio da sessão
├── dowsing.ts, finds.ts # item escondido mais próximo; achados do companheiro
├── wild.ts              # Repel: teto de spawns e passividade
└── session.ts           # mensagens novas
scripts/items-coverage.ts   # npm run items:coverage
packages/app/golden/        # extensão do caminho dourado: cenário de uso por item
packages/client/src/
├── game/ItemWheel.svelte   # seletor rápido de combate (gamepad)
├── game/Bag.svelte         # bolsos
└── render/                 # indicação do Dowsing
content/items/              # effects.json, tuning.json, held.json, pockets.json
content/companion/finds.json
docs/balance-log.md
```

**Structure Decision**: segue o monorepo existente; regras puras em `shared`, orquestração em `server`, seletor e bolsos em `client/src/game`.

## Complexity Tracking

Sem violações a justificar.
