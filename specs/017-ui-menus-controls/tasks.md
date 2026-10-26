---
description: "Tarefas do spec 017 — interface básica, menu inicial e controles"
---

# Tasks: Interface básica, menu inicial e controles

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: obrigatórios para lógica (princípio V, test-first): bindings, foco, mensagens v9, itens, reordenação, settings. Telas Svelte são verificadas pelo [quickstart.md](quickstart.md).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Criar as pastas `packages/client/src/screens/`, `packages/client/src/game/`, `packages/client/src/i18n/` e `packages/shared/src/input/` (com `index.ts` reexportado em `packages/shared/src/index.ts`)
- [X] T002 [P] Criar `packages/client/src/i18n/pt-BR.ts` (objeto `as const` de chaves → strings com `{var}`) e `packages/client/src/i18n/index.ts` com `t(key, vars?)` tipado pelas chaves (R2)

---

## Phase 2: Foundational (bloqueia todas as histórias)

- [X] T003 [P] Teste em `packages/shared/test/input/bindings.test.ts`: padrões do teclado e Xbox de [contracts/ui-actions.md](contracts/ui-actions.md); `rebind` troca teclas quando "code já pertence a outra ação"; recusa teclas reservadas (F11, AltLeft+F4, MetaLeft/MetaRight); conflito só no mesmo contexto (mapa ou menu)
- [X] T004 Implementar `packages/shared/src/input/bindings.ts`: enum `Action` (`up, down, left, right, confirm, cancel, menu, tabPrev, tabNext, run, dash, move1–move4, combat, recall, interact, picker, throw, nextBall`), `DEFAULT_KEYS`, `PAD_BUTTONS` (Standard mapping, fixo), contexto `map | menu` por ação, `rebind()`, `RESERVED_KEYS`; mover para cá os botões 6–11 de `ACTIONS` para combinações do layout Xbox e registrar a escolha em `contracts/ui-actions.md`
- [X] T005 [P] Teste em `packages/app/test/settings.test.ts`: arquivo ausente/antigo dá defaults por campo; `window` só 1280×720, 1600×900 ou 1920×1080; `textSpeed` em `"slow" | "mid" | "fast"` (default `"mid"`); `uiScale` 0,75–1,5 passo 0,25 (default 1); `bindings` inválido volta ao padrão; patch inválido é recusado e mantém o anterior
- [X] T006 Ampliar `AppSettings` em `packages/shared/src/ipc.ts` (`window`, `fullscreen`, `textSpeed`, `uiScale`, `bindings`) e adicionar `setSettings(patch)` e `quitApp()` ao contrato de IPC ([contracts/settings-ipc.md](contracts/settings-ipc.md))
- [X] T007 Implementar leitura com defaults por campo e `set(patch)` atômico em `packages/app/src/main/settings.ts`; registrar os handlers em `packages/app/src/main/index.ts` (aplicar `setContentSize`/`setFullScreen` na hora e no início) e expor em `packages/app/src/preload/index.ts`
- [X] T008 [P] Teste em `packages/client/test/input/input.test.ts` (estender): `createInput` usa o mapa de `bindings` recebido; `lastDevice` muda com teclado, ponteiro e gamepad; ações de menu (`confirm`, `cancel`, direções) com repetição 400 ms e depois 120 ms
- [X] T009 Refatorar `packages/client/src/input/input.ts` para ler `bindings` e `PAD_BUTTONS` de `@soulsilver/shared/input` (remover a tabela `ACTIONS` fixa e o comentário `shortcut:`), expor `onAction(cb)` para ações de menu e um store Svelte `activeDevice`
- [X] T010 [P] Teste em `packages/client/test/input/focus.test.ts`: escolha do próximo focável por direção a partir de retângulos (função pura `nextInDirection(rects, from, dir)`)
- [X] T011 Implementar `packages/client/src/input/focus.ts`: direções movem o foco do DOM com `nextInDirection`, `confirm` chama `click()`, `cancel` chama o `onBack` da tela registrada; foca o primeiro botão ao montar a tela
- [X] T012 [P] Criar `packages/client/src/Glyph.svelte`: mostra a tecla ligada à ação ou o botão Xbox conforme `activeDevice`
- [X] T013 Montar a máquina de telas em `packages/client/src/App.svelte` (`firstRun | title | home | about | settings | controls | play-save | play-mode | play-join | game`, com volta por `cancel` conforme [data-model.md](data-model.md)); aplicar `--ui-scale` no `html` com `font-size: calc(clamp(14px, 1.5vh, 20px) * var(--ui-scale))`; remover o painel de diagnóstico (versão de protocolo, ticks) da tela principal

**Checkpoint**: controles, foco e configurações prontos.

---

## Phase 3: User Story 1 — Título e menu principal (P1) 🎯 MVP

**Goal**: o app abre no título com a arte original e chega ao menu Jogar / Configurações / Sobre / Sair.

**Independent Test**: abrir com assets prontos, pressionar qualquer botão e navegar pelas 4 opções.

- [X] T014 [P] [US1] Teste em `packages/extractor/test/title/stage.test.ts` com fixture sintético (princípio II): o estágio grava `stages/title/*.png` e registra aviso sem falhar o pipeline quando o arquivo não é encontrado
- [X] T015 [US1] Localizar com o probe de `packages/extractor/src/sprites/nitro-gfx.ts` o arquivo gráfico da tela de título do HGSS e implementar `packages/extractor/src/title/stage.ts`; registrar o estágio em `packages/extractor/src/pipeline/run.ts`
- [X] T016 [P] [US1] Criar `packages/client/src/screens/Title.svelte`: arte de `assets://stages/title/`, fundo liso de reserva, versão do app e `t("title.pressAny")`; qualquer tecla, clique ou botão avança
- [X] T017 [P] [US1] Criar `packages/client/src/screens/Home.svelte`: Jogar, Configurações, Sobre, Sair (`quitApp()`); integrar `UpdateNotice.svelte` com a oferta de reiniciar
- [X] T018 [P] [US1] Criar `packages/client/src/screens/About.svelte`: versão, créditos e aviso de projeto de fã sem afiliação com a Nintendo
- [X] T019 [US1] Passar `FirstRun.svelte` e `UpdateNotice.svelte` pelo `t()` e ligar title → home → about em `App.svelte`

---

## Phase 4: User Story 2 — Escolher save e modo (P1)

**Goal**: save → modo → partida/IP, chegando ao mapa; substitui a tela provisória do spec 12.

**Independent Test**: do título ao mapa em ≤ 4 escolhas continuando um save em Sozinho.

- [X] T020 [P] [US2] Teste em `packages/app/test/save-store.test.ts` (estender): `listSaves()` inclui `badges` (0–16) em slots `ok`
- [X] T021 [US2] Adicionar `badges` a `SlotSummary` em `packages/shared/src/save/schema.ts` e preenchê-lo em `packages/app/src/main/save-store.ts`
- [X] T022 [US2] Criar `packages/client/src/screens/PlaySave.svelte` a partir de `SaveSlots.svelte` e `NewGame.svelte`: 3 slots com nome, tempo de jogo e insígnias; slot vazio = novo jogo (nome até `PLAYER_NAME_MAX`, personagem masculino/feminino); slot ilegível sobrescrito só com confirmação; último save usado já focado
- [X] T023 [US2] Criar `packages/client/src/screens/PlayMode.svelte` com Sozinho, Hospedar (com `FirewallNotice.svelte`) e Entrar, movendo a lógica `begin`/`host`/`join` de `MainMenu.svelte`
- [X] T024 [US2] Adaptar `packages/client/src/JoinGame.svelte` como passo `play-join`: lista de partidas e campo de IP com validação antes de conectar; falha mostra a mensagem e volta à lista
- [X] T025 [US2] Remover `packages/client/src/MainMenu.svelte` e manter a Arena de teste (dev) como opção em `PlayMode.svelte` só no modo desenvolvimento

---

## Phase 5: User Story 3 — HUD de combate (P1)

**Goal**: HP, nível, status, 4 golpes com cor do tipo e cooldown, HP do alvo e resumo da equipe.

**Independent Test**: combate em 1280×720 e 1920×1080 com tudo visível e atualizado.

- [X] T026 [P] [US3] Criar `packages/client/src/game/type-colors.ts`: cor para cada `TYPE_KEYS`
- [X] T027 [US3] Criar `packages/client/src/game/CombatHud.svelte` substituindo `ArenaHud.svelte`: HP/nível/status do controlado, 4 golpes com `conic-gradient` de cooldown e `<Glyph>`, resumo da equipe com desmaiados marcados; ligar em `GameSession.svelte`
- [X] T028 [US3] Desenhar a barra de HP sobre o selvagem em combate em `packages/client/src/render/game-renderer.ts` (ou overlay posicionado pela câmera em `CombatHud.svelte`)
- [X] T029 [US3] Remover `packages/client/src/ArenaHud.svelte` e conferir escalas 0,75 e 1,5 em 1280×720 e 1920×1080

---

## Phase 6: User Story 4 — Diálogos com sim ou não (P1)

**Goal**: caixa de diálogo do catálogo com variáveis, avanço, sim/não e velocidade configurável.

**Independent Test**: diálogo com o nome do jogador e pergunta respondida nas duas opções.

- [X] T030 [P] [US4] Teste em `packages/client/test/game/dialog-queue.test.ts`: `say` e `ask` em fila; confirmar completa o texto e depois avança; cancelar na pergunta devolve `false`; velocidades 8/4/1 quadros por caractere
- [X] T031 [US4] Implementar `packages/client/src/game/dialog-queue.ts` (lógica pura, formata com `@soulsilver/shared/text`, `trainer-name` = nome do jogador)
- [X] T032 [US4] Criar `packages/client/src/game/DialogBox.svelte` usando `dialog-queue.ts` e `textSpeed` das configurações; montar em `GameSession.svelte` e um diálogo de teste só no modo desenvolvimento

---

## Phase 7: User Story 5 — Equipe, mochila e Pokédex (P2)

**Goal**: ver e reordenar a equipe, usar Potions, consultar a Pokédex.

**Independent Test**: reordenar, usar uma Potion fora de combate e abrir a entrada de uma espécie capturada.

- [X] T033 [P] [US5] Teste em `packages/shared/test/game/protocol-v9.test.ts`: `reorder-party {from,to: 0–5}` e `use-item {item, partyIndex: 0–5}` válidos e inválidos; `NOTICE_CODES` com `action-refused` e `item-unavailable`
- [X] T034 [P] [US5] Teste em `packages/server/test/items.test.ts`: Potion cura pelo dado do item limitada ao HP máximo e consome 1; recusa alvo desmaiado, HP cheio, item fora da bolsa, em combate; outros itens dão `item-unavailable`
- [X] T035 [P] [US5] Teste em `packages/server/test/reorder-party.test.ts`: índices na equipe, `from ≠ to`, fora de combate; senão `action-refused`; nova ordem reenviada em `party` e persistida no save
- [X] T036 [US5] Adicionar as mensagens `reorder-party` e `use-item` e os códigos de notice em `packages/shared/src/game/protocol.ts`; `PROTOCOL_VERSION` 8 → 9 em `packages/shared/src/protocol-version.ts`
- [X] T037 [US5] Implementar `packages/server/src/items.ts` e tratar `use-item` e `reorder-party` em `packages/server/src/session.ts`
- [X] T038 [P] [US5] Criar `packages/client/src/game/PartyMenu.svelte`: até 6 membros, resumo (stats, golpes, natureza, habilidade, XP até o próximo nível) e mover membro (sem reordenar com 1 membro)
- [X] T039 [P] [US5] Criar `packages/client/src/game/Bag.svelte`: bolsos de `POCKET_KEYS` com abas `tabPrev`/`tabNext`, itens e quantidades; só Potion usável (escolhe o alvo), demais marcados como indisponíveis
- [X] T040 [P] [US5] Criar `packages/client/src/game/Pokedex.svelte`: vistos e capturados; capturado mostra a entrada do catálogo; só visto mostra nome e imagem
- [X] T041 [US5] Criar `packages/client/src/game/PauseMenu.svelte` (Equipe, Mochila, Pokédex, Configurações, Sair da sessão) aberto pela ação `menu` em `GameSession.svelte`

---

## Phase 8: User Story 6 — Menus não pausam o mundo (P2)

**Goal**: "ocupado" visível aos outros; menus completos bloqueados em combate.

**Independent Test**: dois jogadores; um abre a mochila e o outro vê "ocupado" em ≤ 1 s.

- [X] T042 [P] [US6] Teste em `packages/server/test/menu-busy.test.ts`: `menu {open:true}` marca `data.busy`; fechar limpa; em combate responde `menu-blocked` sem marcar; combate iniciado com menu aberto limpa `busy`
- [X] T043 [US6] Adicionar a mensagem `menu {open: boolean}` e o código `menu-blocked` em `packages/shared/src/game/protocol.ts`; tratar em `packages/server/src/session.ts`
- [X] T044 [US6] Em `packages/client/src/GameSession.svelte`: enviar `menu` ao abrir/fechar o `PauseMenu`, zerar o movimento local com o menu aberto, mostrar aviso "o jogo continua", fechar o menu ao entrar em combate e mostrar o motivo de `menu-blocked`
- [X] T045 [US6] Mostrar o indicador "ocupado" sobre jogadores com `data.busy` em `packages/client/src/render/game-renderer.ts`
- [X] T046 [US6] Registrar "menus não pausam" e "ocupado" em `docs/balance-log.md`

---

## Phase 9: User Story 7 — Controles e configurações (P2)

**Goal**: remapear teclas e ajustar janela, tela cheia, velocidade do texto e escala.

**Independent Test**: remapear, reiniciar e conferir que persiste e funciona.

- [X] T047 [P] [US7] Criar `packages/client/src/screens/Settings.svelte`: tamanho da janela, tela cheia, velocidade do texto, escala da interface, botão Controles; cada mudança chama `setSettings` e vale na hora
- [X] T048 [P] [US7] Criar `packages/client/src/screens/Controls.svelte`: lista de ações com `<Glyph>`, capturar a próxima tecla, aviso de troca em conflito, recusa de tecla reservada, "restaurar padrões"
- [X] T049 [US7] Recarregar os `bindings` em `createInput` ao salvar (sem reiniciar o app) e abrir Settings também a partir do `PauseMenu`

---

## Phase 10: Polish

- [X] T050 [P] (a tela da Arena de teste, só de desenvolvimento, ficou com textos literais) Passar todo texto restante de `packages/client/src/**/*.svelte` pelo `t()` (checagem: nenhuma string visível literal fora de `i18n/pt-BR.ts`)
- [X] T051 [P] Atualizar `.claude/skills/run-soulsilver` com as teclas novas de menu
- [X] T052 Rodar `pnpm test` e o roteiro completo de [quickstart.md](quickstart.md) (SC-001 a SC-006)

---

## Dependencies & Execution Order

- Setup → Foundational (T003–T013) → histórias.
- US1 depende só da Foundational. US2 depende de US1 (Home leva ao Play). US3, US4 dependem da Foundational e de um jogo em andamento (US2 ou Arena dev).
- US5 precisa de T036 (protocolo v9) antes de T037. US6 usa o `PauseMenu` de US5 (T041). US7 depende de T006–T009.
- Dentro de cada história: testes antes da implementação.

## Parallel Examples

- Foundational: T003, T005, T008, T010, T012 juntos.
- US1: T014, T016, T017, T018 juntos.
- US5: T033, T034, T035 juntos; depois T038, T039, T040 juntos.
- US7: T047 e T048 juntos.

## Implementation Strategy

1. MVP: Setup + Foundational + US1 + US2 (título até o mapa, operável com gamepad e teclado).
2. Depois US3 e US4 (combate legível e diálogo, base do spec 19).
3. Por fim US5, US6, US7 e Polish; protocolo v9 entra inteiro em US5/US6.
