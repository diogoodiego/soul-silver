# Tasks: Economia, Centro Pokémon e PC

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: obrigatórios pela constituição (princípio V, test-first): cada teste é escrito e falha antes da implementação. Render e UI ficam isentos, com verificação manual.

**Format**: `- [ ] [ID] [P?] [Story?] Descrição com caminho`

## Phase 1: Setup

- [X] T001 [P] (removido no polimento: as caixas ficaram como constantes do schema do save) Criar `content/pc/pc.json` (`boxCount` 18, `slotsPerBox` 30, `defaultNames` "BOX 1"…"BOX 18") conforme [contracts/content-shops.md](contracts/content-shops.md)
- [X] T002 [P] Registrar em `docs/balance-log.md` o desvio "cura não restaura PP: o jogo não guarda PP" (valor original: restaura PP; novo: só HP e status; motivo: golpes usam cooldown em tempo real) e ajustar "PP" no texto de `specs/023-economy-center-pc/spec.md` (US2 cenário 1, SC-003)

## Phase 2: Foundational (bloqueia todas as histórias)

- [X] T003 [P] Teste vermelho da migração em `packages/shared/test/save/migrate-v7.test.ts`: um save v6 com `storage` de 0, 1 e 30 Pokémon vira v7 com `boxes` de 18 caixas, `storage[i]` em `boxes[0].slots[i]`, `pcItems: []`, nenhum Pokémon perdido ou duplicado; `storage` não existe mais
- [X] T004 Em `packages/shared/src/save/schema.ts`: `SAVE_SCHEMA_VERSION` 7; remover `storage` e `STORAGE_MAX`; adicionar `boxes` (lista de 18 `{ name: string 1..8, slots: (PartyMember | null)[30] }`) e `pcItems` (`{ item 1..0xffff, count 1..999 }[]`, máx. 50, item único); atualizar `newCollection`; adicionar o passo 6 → 7 em `packages/shared/src/save/migrate.ts`
- [X] T005 [P] Teste vermelho do protocolo v16 em `packages/shared/test/game/protocol-v16.test.ts`: `shopOpen`, `shopResult`, `pcOpen`, `pcResult`, `shopClose`, `pcClose` e os pedidos `shop-buy`, `shop-sell`, `shop-leave`, `pc-move`, `pc-rename`, `pc-items`, `pc-leave` validam; cliente com versão 15 é recusado
- [X] T006 Adicionar essas mensagens em `packages/shared/src/game/protocol.ts` e `PROTOCOL_VERSION` 16 em `packages/shared/src/protocol-version.ts`, conforme [contracts/protocol-v16.md](contracts/protocol-v16.md)
- [X] T007 [P] Teste vermelho em `packages/shared/test/pc/boxes.test.ts` das operações puras: primeira vaga livre, mover entre equipe e caixa e entre caixas, recusar origem vazia, destino ocupado, caixa ou vaga inexistente, depositar o último Pokémon apto, renomear (nome vazio ou > 8 recusado)
- [X] T008 Implementar `packages/shared/src/pc/boxes.ts` (e `index.ts`, export em `packages/shared/package.json`) que passa nos testes de T007; cada operação valida tudo antes de alterar
- [X] T009 Adaptar o que usava `storage` para `boxes`: `packages/server/src/capture.ts` (equipe cheia → primeira vaga livre; sem vaga, aviso `storage-full`), `packages/server/src/scripts.ts` (`giveMon`), `packages/server/src/session.ts`, `packages/server/test/harness.ts`, `packages/shared/test/save/coherence.test.ts` e os testes de captura (`packages/server/test/capture.test.ts`)
- [X] T010 [P] Teste vermelho em `packages/server/test/capture.test.ts`: capturar com equipe cheia põe o Pokémon na primeira vaga livre; com todas as caixas cheias a captura é bloqueada com `storage-full`

**Checkpoint**: save v7, protocolo v16 e operações de caixa prontos; o armazenamento temporário já é o PC.

## Phase 3: User Story 1 - Comprar e vender na loja (P1) 🎯 MVP

**Goal**: comprar e vender com estoque e preços originais, validados no servidor.

**Independent Test**: loja de Cherrygrove City: comprar 3 itens, vender 1, conferir dinheiro e bolsa; recusas sem alterar estado.

- [X] T011 [P] [US1] Teste vermelho do extrator em `packages/extractor/test/data/shops.test.ts`: uma tabela de mart sintética gera `{ id, items: [{ item, minBadges? }] }`; a lista progressiva do Poké Mart comum gera `minBadges`
- [X] T012 [US1] Implementar `packages/extractor/src/data/shops.ts` (tabelas de mart do arm9, pesquisa R1) e gravar `shops.json`; schema zod em `packages/shared/src/game-data/shops.ts` (`minBadges` 0..16, item existente em `items.json`) com erro claro de arquivo, caminho e problema
- [X] T013 [P] [US1] Teste vermelho em `packages/shared/test/economy/trade.test.ts`: venda = `floor(price / 2)`; `price` 0 e `key-items` não vendáveis; compra recusada por dinheiro < qty × preço, qty < 1 ou > 99, item fora do estoque, bolsa cheia; venda recusada por item ausente ou quantidade maior que a posse; dinheiro limitado a 999999 na venda; recusa não altera nada
- [X] T014 [US1] Implementar `packages/shared/src/economy/trade.ts` (compra, venda, estoque por insígnias) passando T013
- [X] T015 [P] [US1] Teste vermelho em `packages/server/test/shop.test.ts`: `MartBuy` abre `shopOpen` filtrado pelas insígnias do jogador; `shop-buy` e `shop-sell` aplicam e respondem `shopResult` com o saldo; sem sessão aberta tudo é recusado; a sessão fecha ao sair, desconectar e entrar em batalha; dois jogadores têm dinheiro e bolsa independentes
- [X] T016 [US1] Implementar `packages/server/src/shop.ts` e ligar `MartBuy`/`MartSell` em `packages/server/src/scripts.ts` (`bridge`), com carregamento de `shops.json` ao lado do loader existente
- [X] T017 [P] [US1] Criar `packages/client/src/game/Shop.svelte` (lista com preço, quantidade, total, confirmação; abas comprar e vender; motivo de recusa), ligá-la em `packages/client/src/GameSession.svelte` e `packages/client/src/net/game-connection.ts`; textos em `packages/client/src/i18n/pt-BR.ts`; verificar manualmente
- [X] T018 [US1] Verificar manualmente as lojas de Cherrygrove City e Violet City contra o original (produtos, preços, itens por insígnia antes e depois do Falkner), conforme [quickstart.md](quickstart.md)
- [X] T018a [US1] (extra, achado no teste do app) Menu de escolha dos scripts: `MenuInit`, `MenuInitStdGmm` (banco 191), `MenuItemAdd`, `MenuExec` em `packages/shared/src/script/handlers/menu.ts`, pedido `menu` no protocolo e lista na `packages/client/src/game/DialogBox.svelte`; comando 21 (`RestartCurrentScript`, o ReturnCommonScript do original) volta do `CallStd`, em `packages/shared/src/script/handlers/flow.ts`

## Phase 4: User Story 2 - Curar no Centro Pokémon (P1)

**Goal**: a enfermeira cura a equipe e o Centro vira o ponto de retorno.

**Independent Test**: ferir e envenenar a equipe, falar com a enfermeira, conferir restauração e o retorno após blackout.

- [X] T019 [P] [US2] Teste vermelho em `packages/server/test/heal.test.ts`: `healParty` restaura HP e status de toda a equipe e grava `respawn` com a entrada do Centro corrente; só a equipe e o `respawn` do jogador curado mudam; entrar no mapa do Centro sem curar não altera `respawn`; blackout depois da cura leva àquele Centro
- [X] T020 [US2] Em `packages/server/src/scripts.ts` fazer `healParty` gravar o `respawn`; em `packages/server/src/companion.ts` trocar a gravação por entrada (linha do `pokemonCenters`) por guardar a entrada candidata que o `healParty` consome

**Checkpoint**: Cherrygrove (US1) e Centro (US2) jogáveis.

## Phase 5: User Story 3 - Guardar e retirar no PC (P2)

**Goal**: PC de Pokémon e de itens completo.

**Independent Test**: depositar, mover de caixa, renomear, retirar; depositar e retirar um item.

- [X] T021 [P] [US3] Teste vermelho em `packages/shared/test/pc/items.test.ts`: depositar e retirar respeitam a posse, 999 por item, 50 itens distintos e o espaço da bolsa; nada se perde
- [X] T022 [US3] Implementar `packages/shared/src/pc/items.ts` passando T021
- [X] T023 [US3] Identificar o comando de script do PC no log de comandos faltantes (pesquisa R3), incluí-lo em `BRIDGED` em `packages/shared/src/script/handlers/bridge.ts` com teste em `packages/shared/test/script/` que o ponteia ao host
- [X] T024 [P] [US3] Teste vermelho em `packages/server/test/pc.test.ts`: o comando abre `pcOpen`; `pc-move`, `pc-rename` e `pc-items` aplicam e respondem `pcResult`; recusas (`occupied`, `empty`, `last-fighter`, `full`, `invalid`) não alteram estado; Pokémon inexistente é recusado; sem sessão tudo é recusado
- [X] T025 [US3] Implementar `packages/server/src/pc.ts` e ligar o comando em `packages/server/src/scripts.ts`
- [X] T026 [P] [US3] Criar `packages/client/src/game/PcPanel.svelte` (equipe e caixas, mover, renomear, resumo do Pokémon, aba de itens) ligado em `packages/client/src/GameSession.svelte`; textos em `packages/client/src/i18n/pt-BR.ts`; verificar manualmente
- [X] T027 [US3] Teste em `packages/app/test/save-store.test.ts` do carregamento de um save v6 com Pokémon no armazenamento temporário: todos aparecem no PC, sem perda nem duplicação

## Phase 6: Polish

- [X] T028 Rodar `pnpm -r test`, o typecheck e a validação manual completa de [quickstart.md](quickstart.md)
- [X] T029 Rodar `graphify update .` e atualizar `docs/balance-log.md` se algum valor mudou durante a implementação

## Dependencies

- Phase 1 → Phase 2 (T003-T010) → US1, US2, US3. US1 e US2 são independentes entre si; US3 depende só da Phase 2.
- Dentro das fases, teste vermelho antes da implementação; T016 depende de T012 e T014; T025 depende de T008, T022 e T023.

## Parallel Examples

- Phase 2: T003, T005, T007, T010 em paralelo (arquivos de teste distintos).
- US1: T011, T013, T015 em paralelo; T017 enquanto T016 evolui.
- US2 pode ser feita em paralelo com US1.

## Implementation Strategy

MVP = Phase 1 + 2 + US1 (loja jogável). Depois US2 (cura, pequena) e US3 (PC). A Phase 2 já entrega a migração do armazenamento temporário.
