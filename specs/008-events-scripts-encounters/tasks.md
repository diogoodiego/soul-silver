# Tasks: Eventos, scripts, encontros e treinadores

**Input**: Design documents from `/specs/008-events-scripts-encounters/`

**Prerequisites**: [plan.md](./plan.md) (obrigatório), [spec.md](./spec.md) (obrigatório), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/events-api.md](./contracts/events-api.md), [quickstart.md](./quickstart.md)

**Tests**: obrigatórios. A constituição (princípio V) exige test-first para o extrator e para a lógica de `shared`. Cada teste é escrito e precisa falhar antes da implementação correspondente. Não há UI nesta feature.

**Organização**: tarefas agrupadas por história de usuário. Todas as fixtures são sintéticas (princípio II); nenhum teste lê a ROM.

**Princípio de cirurgia (karpathy-guidelines)**: cada tarefa altera só os arquivos listados, tem critério de pronto verificável e não antecipa trabalho de outra história.

**Ordem recomendada de implementação** (R8): Fundação → US1a (eventos de mapa, formato confirmado) → US3 (treinadores) → US2 (encontros) → US1b (scripts, depende do R0 e da tabela de comandos) → US4. A prioridade de produto continua P1 = US1.

## Status (2026-10-24)

**Implementado e verificado**: typecheck, lint e a suíte inteira passam (um teste de determinismo da
etapa `maps` estoura os 5 s do Vitest quando a máquina está sob carga e passa sozinho em 4,9 s; não
é desta feature). A etapa rodou na ROM real em 33 s: 540 mapas, 2667 NPCs, 1317 warps, 195 gatilhos,
1034 placas, 497 arquivos de script, 66 209 comandos em 691 tipos, **0 comandos desconhecidos,
100% decodificado, 0 referências sem destino**, 142 tabelas de encontro, 540 de headbutt (60 com
árvores) e 737 treinadores.

**Pendente (manual)**: T035, a conferência contra o jogo original e fontes de referência (SC-001,
SC-003). Foi vista só uma amostra informal (Route 29, Falkner, Bugsy).

**Onde a implementação difere deste plano de tarefas** (decisões registradas em research.md):

- Sem `commands.ts` em `shared` nem `movement.ts`: o schema da tabela de comandos fica em `schemas.ts` e
  os movimentos são decodificados em `script.ts` (mesmos dados, menos arquivos).
- A tabela de comandos (853 comandos e 115 ações de movimento) vem da decomp pública do HeartGold e
  SoulSilver, validada contra os 497 arquivos da ROM; cada argumento carrega `size`.
- Entraram level scripts e headbutt (mesma leitura); Safari e Concurso de Insetos ficaram de fora.
- Argumentos ≥ 0x4000 são variáveis; script id 0 e 0xFFFF não são script.
- T033: nenhum documento do repositório lista as etapas, então não havia o que atualizar.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: US1 a US4; ausente em Setup, Fundação e Polimento
- Testes de `shared` ficam em `packages/shared/test/events/`; os do extrator em `packages/extractor/test/events/`.

---

## Phase 1: Setup

- [X] T001 Confirmar que a saída `assets/stages/events/` está bloqueada pelo `.gitignore` (a pasta `assets/` já é ignorada) e pelo hook de pre-commit; ajustar só essas regras se não estiver. Pronto quando `git check-ignore assets/stages/events/events/report.json` retorna o caminho.
- [X] T002 [P] Adicionar a exportação `"./events"` em `packages/shared/package.json`, apontando para `packages/shared/src/events/index.ts`. Pronto quando `npm run typecheck -w @soulsilver/shared` passa.
- [X] T003 [P] Criar as pastas `packages/shared/src/events/`, `packages/shared/test/events/`, `packages/extractor/src/events/`, `packages/extractor/test/events/`, `packages/extractor/test/fixtures/events/` e `packages/extractor/data/` (`.gitkeep` onde ficarem vazias). Pronto quando aparecem no `git status`.

---

## Phase 2: Fundação (bloqueia todas as histórias)

**⚠️ CRÍTICO**: nenhuma história começa antes do checkpoint desta fase. T004 a T006 bloqueiam apenas scripts (US1b), encontros (US2) e treinadores (US3); os eventos de mapa (US1a) só dependem de T007 a T012.

### Verificação dos formatos (R0)

- [X] T004 Escrever `packages/extractor/src/events/probe.ts`, sonda que lê os NARCs já extraídos (`assets/stages/rom-unpack/narc`) e imprime só caminhos, contagens, tamanhos e magias: para `a/0/3/2`, `a/0/1/2`, `a/0/3/7`, `a/0/5/5` e `a/0/5/6`, incluindo a tabela de ponteiros e o terminador de scripts, o tamanho dos comandos, os campos de 196 bytes dos encontros e os de 20 bytes dos treinadores. Pronto quando roda sem erro e não grava nada no repositório.
- [X] T005 Preencher a seção R0 de `specs/008-events-scripts-encounters/research.md` com cada item de "A confirmar na sonda antes da implementação" resolvido (scripts, encontros, treinadores, ligações, índices de New Bark Town, laboratório do Elm e Route 29), sem bytes da ROM. Pronto quando cada item está resolvido ou marcado como bloqueio de US1b, US2 ou US3.
- [X] T006 Com o R0 fechado, atualizar `plan.md`, `data-model.md` e `contracts/events-api.md` onde o formato real divergir (nomes de campo provisórios, variantes de encontro do HGSS em `ENCOUNTER_KINDS`) e fixar por escrito a regra de continuação após comando desconhecido (R2). Se o formato mudar a estrutura dos metadados, parar para revisão antes de T008. Pronto quando o gate está decidido por escrito.

### Contratos em `shared` (test-first)

- [X] T007 [P] Escrever `packages/shared/test/events/schemas.test.ts` cobrindo: `MapEvents`, `ScriptBlock`, `EncounterFile`, `TrainerFile` e `EventsReport` válidos; `formatVersion` ausente; rótulo inexistente num `jump`; `minLevel` maior que `maxLevel`; `level` de `TeamMember` fora de "1 a 100"; id de comando repetido na tabela; comando bruto sem `bytes`; cada erro lança `GameDataError` com arquivo, caminho do campo e problema (FR-015, SC-006). Pronto quando o teste existe e falha.
- [X] T008 Implementar `packages/shared/src/events/constants.ts` (`EVENTS_FORMAT_VERSION = GAME_DATA_FORMAT_VERSION`, `ENCOUNTER_KINDS` conforme T006), `schemas.ts` (zod, via o codec de `game-data`: `parseMapEvents`, `parseScriptBlock`, `parseEncounterFile`, `parseTrainerFile`, `parseEventsReport`, `serializeEventsFile` com chaves em ordem estável), `commands.ts` (`CommandSpec`, `parseCommandTable`) e `index.ts`. Seguir `packages/shared/src/maps/schemas.ts`. Pronto quando T007 passa.

### Leitores e dados base (test-first)

- [X] T009 [P] Escrever `packages/extractor/test/events/command-table.test.ts` e implementar `packages/extractor/src/events/command-table.ts` (carrega e valida `data/script-commands.json` com `parseCommandTable`; erro com arquivo e linha para id repetido ou tipo de argumento inválido). Pronto quando o teste passa.
- [X] T010 [P] Criar `packages/extractor/data/script-commands.json` com a tabela de comandos de HGSS levantada no R0 (id, nome, argumentos com nome e tipo entre `u8`, `u16`, `u32`, `text`, `species`, `move`, `item`, `flag`, `variable`, `jump`, `movement`). Pronto quando `parseCommandTable` aceita o arquivo e cobre todos os comandos vistos pela sonda.
- [X] T011 [P] Criar os builders de fixture em `packages/extractor/test/fixtures/events/builders.ts`: arquivo de eventos (1 NPC, 1 warp, 1 gatilho condicional, 1 placa), script com desvio e um comando desconhecido, script compartilhado por dois eventos, encontro de 196 bytes com 3 horários, treinador de 20 bytes com time de 2 Pokémon e mini-ROM com 2 mapas. Pronto quando um teste de sanidade monta a mini-ROM sem ler a ROM real.
- [X] T012 Escrever `packages/extractor/test/events/refs.test.ts` e implementar `packages/extractor/src/events/refs.ts` (índice de texto → `{ bank, index }` da 005; espécie, golpe e item → `id()` da 004; índice sem entrada → valor bruto com `unresolved: true` e registro para o relatório, R4). Pronto quando o teste passa (FR-008).
- [X] T013 Escrever `packages/extractor/src/events/layout.ts` com os caminhos dos NARCs (`a/0/3/2`, `a/0/1/2`, `a/0/3/7`, `a/0/5/5`, `a/0/5/6`), os tamanhos de registro e as tabelas de mapeamento confirmadas no R0. Reaproveitar `MAP_ARCHIVES` de `packages/extractor/src/maps/stage.ts` onde já existir. Pronto quando o layout cita só o que o R0 confirmou.

**Checkpoint**: contratos, tabela de comandos, referências, layout e fixtures prontos.

---

## Phase 3: User Story 1 — Eventos e scripts legíveis (P1)

**Meta**: por mapa, NPCs, warps, gatilhos e placas; scripts como lista de comandos com argumentos nomeados e rótulos; sequências de movimento; comando desconhecido preservado.

**Teste independente**: com a mini-ROM sintética, extrair e conferir eventos, comandos, rótulos e o comando bruto; com a ROM real, comparar New Bark Town, o laboratório do Elm e a Route 29 (SC-001).

### US1a: eventos de mapa

- [X] T014 [P] [US1] Escrever `packages/extractor/test/events/zone.test.ts`: NPC com posição, sprite, tipo de movimento, script e `visibleFlag`; warp com `destMap`; gatilho com `{ variable, value }`; placa com `kind`; arquivo vazio gera listas vazias; contagem que passa do tamanho do arquivo falha com membro e offset (FR-001 a FR-004). Pronto quando o teste existe e falha.
- [X] T015 [US1] Implementar `packages/extractor/src/events/zone.ts` (quatro listas com contagem `u32`: placas de 20 bytes, NPCs de 32, warps de 12, gatilhos de 16, conforme o R0), validando limites. Pronto quando T014 passa.
- [X] T016 [P] [US1] Escrever `packages/extractor/test/events/movement.test.ts` e implementar `packages/extractor/src/events/movement.ts` (sequência de movimento → lista de `{ action, count }`; passo desconhecido preservado bruto). Pronto quando o teste passa (FR-006).

### US1b: scripts

- [X] T017 [P] [US1] Escrever `packages/extractor/test/events/script.test.ts`: comandos com argumentos nomeados; argumento `text` vira identificador da 005; desvio vira rótulo `L1`, `L2` na ordem de aparição; alvo fora do script falha o script; comando desconhecido sai como `{ raw: true, id, bytes }` na posição original e o decodificador segue conforme T006; script com vários pontos de entrada preenche `entries`; script cortado sai com `partial: true` (FR-005, FR-007, FR-008). Pronto quando o teste existe e falha.
- [X] T018 [US1] Implementar `packages/extractor/src/events/script.ts` (decodificador dirigido por `command-table.ts`, rótulos por R3, referências por `refs.ts`, movimentos por `movement.ts`). Pronto quando T017 passa.

### Etapa

- [X] T019 [P] [US1] Escrever `packages/extractor/test/events/stage.test.ts`: com a mini-ROM, a etapa gera `maps/<mapId>.json` por mapa, `scripts/<bloco>.json` com o script compartilhado uma vez e cada evento apontando para o índice, e valida tudo com os `parse*` antes de gravar; índice de evento, script ou encontro fora da faixa falha com mapa e índice (FR-009, FR-015, FR-019). Pronto quando o teste existe e falha.
- [X] T020 [US1] Criar `packages/extractor/src/events/stage.ts` (etapa `events`: `id`, `title` em PT-BR, `version = 1`, `weight`, entradas `narc` e `code` da 003, dados da 004, catálogo da 005 e cabeçalhos da 006; usa `readNarcMember` e os índices de `maps/header.ts`) gravando mapas e scripts na pasta de preparo. Seguir `packages/extractor/src/sprites/stage.ts`. Pronto quando T019 passa.

**Checkpoint**: eventos e scripts extraídos e válidos; US1 testável sozinha.

---

## Phase 4: User Story 2 — Tabelas de encontro por tipo e horário (P2)

**Meta**: por mapa, grama em manhã, dia e noite, surf, cada vara, Rock Smash e demais variantes, com espécie, taxa e faixa de nível.

**Teste independente**: com a tabela sintética, extrair e conferir a separação por tipo e horário; com a ROM real, comparar 5 rotas (SC-003).

- [X] T021 [P] [US2] Escrever `packages/extractor/test/events/encounter.test.ts`: grama com 3 horários; surf, `rods` e `rockSmash`; variantes em `other`; cada entrada com `species`, `rate`, `minLevel` e `maxLevel` com `minLevel ≤ maxLevel`; taxas na ordem e com a soma do original; tipo ausente não aparece (sem tabela vazia); encontro de arquivo com tamanho diferente de 196 bytes falha com membro e tamanho (FR-010 a FR-012). Pronto quando o teste existe e falha.
- [X] T022 [US2] Implementar `packages/extractor/src/events/encounter.ts` (arquivo de 196 bytes → `MapEncounters`, campos conforme o R0). Pronto quando T021 passa.
- [X] T023 [US2] Registrar a gravação de `encounters.json` (mapa → `MapEncounters`, só mapas com encontros, ligando cada mapa ao encontro do cabeçalho) em `packages/extractor/src/events/stage.ts` e estender `packages/extractor/test/events/stage.test.ts`. Pronto quando o teste de etapa gera `encounters.json` válido.

**Checkpoint**: encontros extraídos; US2 testável sozinha.

---

## Phase 5: User Story 3 — Times de treinadores (P3)

**Meta**: classe, nome e time com nível, golpes, item segurado e flags de IA; NPC treinador aponta para o treinador.

**Teste independente**: com o treinador sintético, extrair e conferir o time; com a ROM real, comparar 5 treinadores (SC-003).

- [X] T024 [P] [US3] Escrever `packages/extractor/test/events/trainer.test.ts`: `class` e `name` pelo catálogo de textos; `aiFlags` por nome; `items` por id da 004; `team` na ordem do original; `level` de "1 a 100"; `moves` `null` quando o original usa os padrões do nível; `heldItem` `null` quando não há; espécie fora da faixa falha com treinador e índice (FR-013). Pronto quando o teste existe e falha.
- [X] T025 [US3] Implementar `packages/extractor/src/events/trainer.ts` (`a/0/5/5` com 20 bytes por treinador e `a/0/5/6` com o time, conforme o R0). Pronto quando T024 passa.
- [X] T026 [US3] Registrar a gravação de `trainers.json` em `packages/extractor/src/events/stage.ts` e preencher `trainer` dos NPCs (FR-014) com o id do treinador ligado ao evento; estender `packages/extractor/test/events/stage.test.ts` para cobrir o NPC treinador. Pronto quando o teste de etapa passa.

**Checkpoint**: treinadores extraídos e ligados aos NPCs.

---

## Phase 6: User Story 4 — Relatório de cobertura de scripts (P4)

**Meta**: relatório com cada comando, ocorrências e mapas; comandos desconhecidos e scripts não decodificados à parte.

**Teste independente**: relatório sobre scripts sintéticos com contagens conhecidas; um comando desconhecido aparece em destaque.

- [X] T027 [P] [US4] Escrever `packages/extractor/test/events/report.test.ts`: `commands` ordenado por `count` decrescente e nome; `maps` em ordem crescente e sem repetição; `unknownCommands` com `raw:<id>`; `undecodedScripts` com script, mapa e motivo; `unresolvedRefs`; `decodedPercent`; `ok = false` quando um script da história principal não é decodificado ou a perda passa de 2% nas demais categorias (FR-017, FR-018). Pronto quando o teste existe e falha.
- [X] T028 [US4] Implementar `packages/extractor/src/events/report.ts` (`EventsReport`, `buildEventsReport`, resumo para a CLI) e gravar `report.json` na etapa. Pronto quando T027 passa.
- [X] T029 [US4] Integrar à CLI em `packages/extractor/src/cli.ts`: o relatório de cobertura entra ao fim do relatório de sanidade, com o mesmo código de saída; ajustar `packages/extractor/test/cli.test.ts`. Pronto quando o teste de CLI cobre a seção de eventos.
- [X] T030 [US4] Incluir `eventsStage` em `packages/extractor/src/stages/index.ts` depois de `spritesStage` e atualizar o comentário de "New stages". Pronto quando `defaultStages` o lista e o teste de pipeline passa.

**Checkpoint**: relatório de cobertura e etapa no pipeline.

---

## Phase 7: Polimento e conferência

- [X] T031 [P] Escrever `packages/extractor/test/events/determinism.test.ts`: duas execuções da etapa com a mini-ROM geram saída idêntica byte a byte; saída anterior incompleta é substituída por inteiro (FR-016, SC-004). Pronto quando passa.
- [X] T032 [P] Garantir que `packages/shared/src/events/` não importa APIs do Node e que nenhum dado extraído foi commitado (`npm run check:assets`). Pronto quando a verificação passa.
- [X] T033 Atualizar a documentação do extrator que lista as etapas (buscar `sprites` em `docs/` e `README.md`) para incluir a etapa `events` e o relatório de cobertura. Pronto quando a lista cita a nova etapa.
- [X] T034 Rodar `npm run typecheck`, `npm run lint`, `npm run test` e `npm run check:assets`. Pronto quando todos passam sem exceção.
- [ ] T035 Conferência manual com a ROM real (quickstart §3 a §6): relatório com 100% dos scripts decodificados (SC-002); eventos de New Bark Town, do laboratório do Elm e da Route 29 iguais ao jogo original (SC-001); 5 rotas e 5 treinadores iguais às fontes de referência (SC-003); duas extrações com hashes idênticos (SC-004). Resultado registrado na seção Status deste arquivo.

---

## Dependências e ordem de execução

- **Setup (T001–T003)** → **Fundação (T004–T013)** → histórias → **Polimento (T031–T035)**.
- Dentro da Fundação: T004 → T005 → T006 → T008, T010, T013; T007 → T008; T009 depende de T008; T010 depende de T005; T011 e T012 em paralelo com T007; T012 depende de T008.
- **US1a (T014–T016)** depende de T008, T011 e T013. **US1b (T017–T018)** depende de T006, T009, T010, T012 e T016. **T019–T020** dependem de T015 (e de T018 para scripts); a etapa nasce em T020 e é estendida por T023 e T026.
- **US2 (T021–T023)** depende de T006, T008, T011, T013 e de T020. **US3 (T024–T026)** depende de T006, T008, T011, T012, T013 e de T020.
- **US4 (T027–T030)** depende de T018 e T020; T029 e T030 dependem de T028.
- US2 e US3 não dependem de US1b nos dados; o esqueleto de `stage.ts` (T020) é o único ponto compartilhado. Se os scripts ficarem bloqueados pelo R0, criar a etapa só com eventos de mapa e seguir por US3 e US2.

## Oportunidades de paralelismo

- Fundação: T007, T009, T011 em paralelo (arquivos distintos); T010 em paralelo com T013 depois do R0.
- US1: T014, T016, T017 e T019 (testes) em paralelo.
- US2 e US3 inteiras em paralelo depois de T020 (arquivos distintos; cuidar só de `stage.ts` e `stage.test.ts`).
- Polimento: T031 e T032 em paralelo.

## Estratégia de implementação

1. **MVP técnico**: Setup + Fundação + US1a (eventos de mapa). Já entrega NPCs, warps, gatilhos e placas, o formato mais bem conhecido (R0 parcial).
2. Acrescentar US3 (treinadores) e US2 (encontros), tabelas de campos fixos.
3. Fechar US1b (scripts) assim que o R0 e a tabela de comandos estiverem prontos, depois US4 (relatório e CLI); a conferência manual (T035) valida SC-001 a SC-004 com a ROM real.
