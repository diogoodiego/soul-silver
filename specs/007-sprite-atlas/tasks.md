# Tasks: Sprites

**Input**: Design documents from `/specs/007-sprite-atlas/`

**Prerequisites**: [plan.md](./plan.md) (obrigatório), [spec.md](./spec.md) (obrigatório), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/sprite-api.md](./contracts/sprite-api.md), [quickstart.md](./quickstart.md)

**Tests**: obrigatórios. A constituição (princípio V) exige test-first para o extrator e para a lógica de `shared`. Cada teste é escrito e precisa falhar antes da implementação correspondente. A página de pré-visualização (UI) é exceção e é verificada manualmente.

**Organização**: tarefas agrupadas por história de usuário. Todas as fixtures são sintéticas (princípio II); nenhum teste lê a ROM.

**Princípio de cirurgia (karpathy-guidelines)**: cada tarefa altera só os arquivos listados, tem critério de pronto verificável e não antecipa trabalho de outra história.

**Ordem recomendada de implementação** (R9): Fundação → US2 (batalha, formato já localizado) → US3 → US1 (depende do R0 do overworld) → US4. A prioridade de produto continua P1 = US1.

## Status (2026-10-23)

**Implementado e verificado** (typecheck, lint, 1267 testes e `check:assets` passando; etapa rodada na ROM real em 4 s com 0 falhas e 0 itens faltando):

| Categoria | Sprites | Quadros |
|-----------|---------|---------|
| battle (493 espécies + 65 formas, normal e shiny, frente e costas, gênero) | 651 | 1302 |
| overworld-player (hero e heroine, andar e correr) | 2 | 64 |
| overworld-npc | 193 | 3088 |
| overworld-pokemon (493 espécies + gênero e formas, normal e shiny) | 566 | 4528 |
| icon-pokemon (493 espécies + Deoxys e Unown) | 523 | 523 |
| icon-item | 536 | 536 |
| trainer | 129 | 129 |

**Pendente:**

- **Verificação manual** (T031, T036): abrir `npm run sprites:view` e conferir cores e âncora; conferência visual de 20 Pokémon (SC-002). Os atlas foram conferidos por mim em imagem, mas não pela página nem em comparação com o jogo.
- **Ícones de formas** além de Deoxys e Unown (Burmy, Wormadam, Shellos, Gastrodon, Giratina, Shaymin, Rotom e outros): os 17 ícones finais do arquivo existem mas não consegui ligá-los a espécie e forma com segurança, então não são extraídos.
- **Ações extras do jogador** (ciclismo, surfe, pesca, escada etc.), objetos e NPCs com outra contagem de quadros: não extraídos.
- **Duração dos quadros** do overworld: provisória (os arquivos não trazem tempo).
- **Divergência do contrato:** o erro de metadados usa o `GameDataError` do codec compartilhado (arquivo, caminho, problema), não uma classe `SpriteFormatError`. NCER e NANR não foram implementados porque nenhuma categoria precisou deles.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: US1 a US4; ausente em Setup, Fundação e Polimento

---

## Phase 1: Setup

- [X] T001 Confirmar em `.gitignore` e no hook de pre-commit que a saída `stages/sprites/` está bloqueada; ajustar só essas regras se não estiver. Pronto quando `git check-ignore assets/stages/sprites/sprites/x.png` retorna o caminho.
- [X] T002 [P] Adicionar a exportação `"./sprites"` em `packages/shared/package.json`, apontando para `packages/shared/src/sprites/index.ts`. Pronto quando `npm run typecheck -w @soulsilver/shared` passa.
- [X] T003 [P] Criar as pastas `packages/shared/src/sprites/`, `packages/shared/test/sprites/`, `packages/extractor/src/sprites/`, `packages/extractor/test/sprites/` e `packages/extractor/test/fixtures/sprites/` (`.gitkeep` onde ficarem vazias). Pronto quando aparecem no `git status`.

---

## Phase 2: Fundação (bloqueia todas as histórias)

**⚠️ CRÍTICO**: nenhuma história começa antes do checkpoint desta fase, exceto que T004 a T006 bloqueiam apenas US1 e o mapeamento de US2.

### Verificação dos formatos (R0)

- [X] T004 Escrever `packages/extractor/src/sprites/probe.ts`, sonda que lê os NARCs já extraídos (`assets/stages/rom-unpack/narc`) e imprime só caminhos, contagens, magias e tamanhos: para `a/0/0/4`, `a/0/2/0`, `a/0/1/8`, `a/0/5/8` e os candidatos de overworld (começando por `a/0/8/1`), incluindo onde ficam os sprites de overworld de Pokémon, jogador e NPCs. Pronto quando roda sem erro e não grava nada no repositório.
- [X] T005 Preencher a seção R0 de `specs/007-sprite-atlas/research.md` com o mapeamento confirmado (6 membros por espécie em `a/0/0/4`, formas e gêneros, arquivos de overworld e tabela de objetos, ligação de item e de treinador), sem bytes da ROM. Pronto quando cada item "Ainda a confirmar" está resolvido ou marcado como bloqueio de US1.
- [X] T006 Se o R0 mostrar que o overworld usa quadros de textura NSBTX, atualizar `plan.md` (estrutura e nota pós-design) e `data-model.md` com a decisão; se mudar o formato do metadado, parar para revisão antes de T007. Pronto quando o gate está decidido por escrito.

### Contratos em `shared` (test-first)

- [X] T007 [P] Escrever `packages/shared/test/sprites/schemas.test.ts` cobrindo: `SpriteSet` válido; `anchor` ausente; `frame` inexistente numa animação; retângulo fora da página; nome de quadro repetido; página maior que `ATLAS_MAX_SIZE` (2048); `ms` < 1; erro com `file`, `path` e `problem` em cada caso (FR-013, SC-006). Pronto quando os testes falham.
- [X] T008 Implementar `packages/shared/src/sprites/constants.ts` (`SPRITE_FORMAT_VERSION = 1`, `ATLAS_MAX_SIZE = 2048`, `SPRITE_CATEGORIES`), `schemas.ts` (zod; `parseSpriteSet`, `parseSpriteReport`, `serializeSpriteFile` com ordem estável, `SpriteFormatError`) conforme `data-model.md`, e `index.ts`. Quote as regras: `name` único, `x, y, w, h` inteiros com `w` e `h` ≥ 1, `ms` ≥ 1, `gender` ∈ `male|female|unisex`. Pronto quando T007 passa.
- [X] T009 [P] Escrever `packages/shared/test/sprites/names.test.ts` e implementar `packages/shared/src/sprites/names.ts` (`spriteName(category, ids)` → `<categoria>/<ids>`; ex.: `battle/25/0`). Pronto quando o teste passa e o nome é estável para os mesmos ids.

### Blocos binários sem ROM (test-first)

- [X] T010 [P] Escrever `packages/extractor/test/sprites/lz10.test.ts` com um fluxo LZ10 sintético (literais e cópias) e erro em tamanho inválido; implementar `packages/extractor/src/sprites/lz10.ts`. Pronto quando passa.
- [X] T011 [P] Testes em `packages/extractor/test/sprites/gfx.test.ts` (NCGR 4 e 8 bpp, ordem de tiles; NCLR BGR555) e `packages/extractor/src/sprites/nitro-gfx.ts` (`readNcgr`, `readNclr` e as duas cifras). NCER e NANR ficaram de fora: nenhuma categoria os usa. Pronto quando passa e magia errada gera erro que diz o arquivo.
- [X] T012 [P] Escrever `packages/extractor/test/sprites/decode.test.ts` e implementar `packages/extractor/src/sprites/decode.ts` (tiles + paleta → RGBA; índice 0 com alfa 0; BGR555 → RGBA8 por `v << 3 | v >> 2`; paleta com menos cores que o gráfico usa → erro com sprite e paleta). Pronto quando passa (FR-012).
- [X] T013 [P] Escrever `packages/extractor/test/sprites/pack.test.ts` e implementar `packages/extractor/src/sprites/pack.ts` (prateleiras, ordem por altura decrescente e nome, páginas ≤ 2048, mesmos retângulos para a variante shiny, sem sobreposição). Pronto quando passa e duas execuções dão o mesmo resultado (SC-004).
- [X] T014 Escrever `packages/extractor/test/sprites/writer.test.ts` e implementar `packages/extractor/src/sprites/writer.ts`: grava PNG (via `../maps/png.ts`) e `<categoria>.json` validado por `parseSpriteSet` antes de gravar. Pronto quando passa e um metadado inválido falha a gravação com arquivo, campo e problema.
- [X] T015 [P] Criar os builders de fixture em `packages/extractor/test/fixtures/sprites/builders.ts`: mini-ROM com 3 espécies (uma com forma, uma com diferença de gênero), 1 item, 1 treinador, 1 personagem e 1 NPC, com paletas normal e shiny. Pronto quando os testes das histórias conseguem importá-lo.
- [X] T016 Escrever `packages/extractor/src/sprites/layout.ts` com as localizações e tabelas de mapeamento confirmadas no R0 (caminhos dos NARCs, índice → espécie/forma/gênero/item/treinador). Pronto quando o layout passa a conferência estrutural das contagens esperadas (493 espécies) em teste sintético.

**Checkpoint**: contratos, leitores, empacotador e gravador testados; fixtures prontas.

---

## Phase 3: User Story 1 — Overworld nas quatro direções (P1)

**Meta**: jogador (2 opções), NPCs e 493 Pokémon com quadros de caminhada nas quatro direções, âncora e animações.

**Teste independente**: com a mini-ROM sintética, extrair e consultar `walk-down/left/right/up` de cada tipo; com a ROM real, conferir a contagem no relatório.

**Bloqueio**: T005/T006 (R0 do overworld).

- [X] T017 [P] [US1] Escrever `packages/extractor/test/sprites/overworld.test.ts`: jogador `player-0` e `player-1` com 4 direções e ações (parado, correr, pedalar quando existirem); NPC com suas ações; Pokémon com `walk-*` nas 4 direções; espécie com forma/gênero tem conjuntos próprios; quadro espelhado sai como `flipX` sem duplicar imagem; forma sem sprite próprio usa a base e fica em `fallbackOf`. Pronto quando os testes falham.
- [X] T018 [US1] Implementar `packages/extractor/src/sprites/overworld.ts` (categorias `overworld-player`, `overworld-npc`, `overworld-pokemon`), seguindo a decisão do T006, com âncora no pé do sprite e duração de cada passo da ROM. Pronto quando T017 passa (FR-001 a FR-003, FR-009).
- [X] T019 [US1] Registrar as três categorias de overworld na etapa em `packages/extractor/src/sprites/stage.ts` (criar o esqueleto da etapa `sprites`: `id`, `title` PT-BR, `version = 1`, `weight`, entradas `narc`/`code`, saída `sprites`, erro por sprite sem interromper os demais). Pronto quando um teste de etapa com a mini-ROM gera `overworld-*.json` válidos.

**Checkpoint**: overworld extraído e válido.

---

## Phase 4: User Story 2 — Sprites de batalha normais e shiny (P2)

**Meta**: frente e costas, normal e shiny, com formas e gêneros.

**Teste independente**: com a mini-ROM, a versão shiny tem os mesmos pixels opacos da normal e cores diferentes.

- [X] T020 [P] [US2] Escrever `packages/extractor/test/sprites/battle.test.ts`: `battle/<espécie>/<forma>/front|back/<gênero>`; shiny com a mesma forma e cores da paleta shiny; espécie `unisex` aponta para os mesmos quadros nos dois gêneros, sem duplicar imagem; forma alternativa e gênero têm sprite próprio ligado por id; paleta shiny ausente vai ao relatório. Pronto quando falha.
- [X] T021 [US2] Implementar `packages/extractor/src/sprites/battle.ts` (categoria `battle`, imagem normal e `shinyFile`), usando `layout.ts`, `decode.ts` e `pack.ts`. Pronto quando T020 passa (FR-004, FR-005).
- [X] T022 [US2] Registrar a categoria `battle` em `packages/extractor/src/sprites/stage.ts`. Pronto quando o teste de etapa gera `battle.json` e as páginas normal e shiny.

**Checkpoint**: batalha extraída; US2 testável sozinha.

---

## Phase 5: User Story 3 — Ícones e treinadores (P3)

**Meta**: ícones de Pokémon (com formas) e de itens, e sprites de treinadores.

**Teste independente**: com a mini-ROM, consultar ícone de espécie, de forma, de item e de treinador, todos com cores corretas.

- [X] T023 [P] [US3] Escrever `packages/extractor/test/sprites/icons.test.ts` (ícone de espécie e de forma; ícone de item pelo id da 004; paleta compartilhada entre ícones) e `packages/extractor/test/sprites/trainers.test.ts` (sprite com 2 gráficos, paleta, células e animação do NCER/NANR). Pronto quando falham.
- [X] T024 [P] [US3] Implementar `packages/extractor/src/sprites/icons.ts` (categorias `icon-pokemon`, `icon-item`). Pronto quando a parte de ícones de T023 passa (FR-006).
- [X] T025 [P] [US3] Implementar `packages/extractor/src/sprites/trainers.ts` (categoria `trainer`, usando `readNcer`/`readNanr`). Pronto quando a parte de treinadores de T023 passa (FR-007).
- [X] T026 [US3] Registrar `icon-pokemon`, `icon-item` e `trainer` em `packages/extractor/src/sprites/stage.ts`. Pronto quando o teste de etapa gera os três JSON.

**Checkpoint**: todas as sete categorias extraídas em teste sintético.

---

## Phase 6: User Story 4 — Relatório e pré-visualização (P4)

**Meta**: relatório de sprites e página de pré-visualização de desenvolvimento.

**Teste independente**: relatório sobre atlas completos (sem alertas) e sobre atlas com um quadro removido; página aberta com atlas sintéticos anima um sprite.

- [X] T027 [P] [US4] Escrever `packages/extractor/test/sprites/report.test.ts`: contagens por categoria; quadro faltando listado com sprite e quadro; paleta ausente; fallback por forma base; `ok = false` quando um dos 493 Pokémon perde sprite ou quando a perda em outra categoria passa de 2%; falha de um sprite não interrompe os demais. Pronto quando falha.
- [X] T028 [US4] Implementar `packages/extractor/src/sprites/report.ts` (`SpriteReport`, `buildSpriteReport`) e gravar `report.json` na etapa. Pronto quando T027 passa (FR-014, FR-015).
- [X] T029 [US4] Integrar à CLI em `packages/extractor/src/cli.ts`: o relatório de sprites entra ao fim do relatório de sanidade, com o mesmo código de saída; ajustar `packages/extractor/test/cli.test.ts`. Pronto quando o teste da CLI cobre sucesso e falha.
- [X] T030 [US4] Incluir `spritesStage` em `packages/extractor/src/stages/index.ts` depois de `mapsStage`. Pronto quando `defaultStages` o lista e o teste de pipeline passa.
- [ ] T031 [P] [US4] Criar `packages/extractor/src/viewer/sprites.html` (lista por categoria; animação em canvas 2D; troca normal/shiny; âncora opcional; mensagem clara sem extração) e a rota dos sprites em `packages/extractor/src/viewer/serve.ts` (somente leitura, `127.0.0.1`). Pronto quando a verificação manual do quickstart §4 passa (FR-017, FR-018).
- [X] T032 [US4] Criar `packages/extractor/src/viewer/sprites-run.ts` e o script `sprites:view` em `package.json` (`node packages/extractor/src/viewer/sprites-run.ts`), seguindo `viewer/run.ts`. Pronto quando `npm run sprites:view` abre a página.

**Checkpoint**: relatório e pré-visualização funcionando.

---

## Phase 7: Polimento e conferência

- [X] T033 [P] Escrever `packages/extractor/test/sprites/determinism.test.ts`: duas execuções da etapa com a mini-ROM geram saída idêntica byte a byte; saída anterior incompleta é substituída por inteiro (SC-004). Pronto quando passa.
- [X] T034 [P] Garantir que `packages/shared/src/sprites/` não importa APIs do Node e que nenhum arquivo de `viewer/` entra no pacote do app (verificar `packages/app` e a configuração do instalador). Pronto quando um teste ou checagem de lint cobre isso (FR-018).
- [X] T035 Rodar `npm run typecheck`, `npm run lint`, `npm run test` e `npm run check:assets`. Pronto quando todos passam sem exceção.
- [ ] T036 Conferência manual com a ROM real (quickstart §3 a §6): relatório com 493 Pokémon sem faltas (SC-001); conferência visual de 20 Pokémon, com ≥ 3 formas e ≥ 3 diferenças de gênero (SC-002); reextração idêntica (SC-004). Registrar o resultado em `specs/007-sprite-atlas/research.md` (seção "Resultado") e revisar o limite de 2% do R5. Pronto quando o resultado está escrito.

---

## Dependências e ordem de execução

- **Setup (T001–T003)** → **Fundação (T004–T016)** → histórias → **Polimento (T033–T036)**.
- Dentro da Fundação: T004 → T005 → T006 → T016; T007 → T008; T009, T010, T011, T012, T013, T015 em paralelo; T014 depende de T008 e T013; T016 depende de T005.
- **US1 (T017–T019)** depende de T006, T011, T012, T013, T014, T016. **US2 (T020–T022)** depende da Fundação; T022 depende de T019 (esqueleto da etapa). **US3 (T023–T026)** depende de T019. **US4 (T027–T032)** depende de T019 e, para o relatório completo, de US1 a US3.
- US2 e US3 não dependem de US1 nos dados; o esqueleto de `stage.ts` (T019) é o único ponto compartilhado. Se US1 ficar bloqueada pelo R0, criar o esqueleto no começo de US2 e seguir.

## Oportunidades de paralelismo

- Fundação: T007, T009, T010, T011, T012, T013, T015 em paralelo (arquivos distintos).
- US3: T024 e T025 em paralelo.
- US4: T027 e T031 em paralelo.

## Estratégia de implementação

1. **MVP técnico**: Setup + Fundação + US2 (batalha). Já entrega sprites de combate normais e shiny, o formato mais bem conhecido.
2. Acrescentar US3 (ícones e treinadores), depois US1 assim que o R0 do overworld fechar.
3. US4 fecha com relatório e pré-visualização; a conferência manual (T036) valida SC-001 a SC-004 com a ROM real.
