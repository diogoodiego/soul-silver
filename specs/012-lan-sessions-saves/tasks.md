# Tasks: LAN, sessões e saves

**Input**: Design documents from `/specs/012-lan-sessions-saves/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: obrigatórios para a lógica (princípio V, test-first): escrever o teste, ver falhar, depois
implementar. UI Svelte é verificada à mão (quickstart).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Adicionar `ws` (e `@types/ws` em dev) às dependências de `packages/server/package.json` e `packages/app/package.json`; rodar `npm install` e confirmar que o build do app empacota `ws` no `utilityProcess` (`packages/app/electron.vite.config.*` ou equivalente)
- [X] T002 [P] Criar a pasta `packages/shared/src/save/` com `index.ts` e exportar o subpath `@soulsilver/shared/save` em `packages/shared/package.json` (mesmo padrão de `@soulsilver/shared/game`)

---

## Phase 2: Foundational (bloqueia todas as histórias)

- [X] T003 [P] Teste do schema em `packages/shared/test/save/schema.test.ts`: aceita o exemplo de `contracts/save-file.md`; recusa `name` vazio/só espaços ou com mais de `PLAYER_NAME_MAX` (16), `character` fora de `"male" | "female"`, `facing` fora das 4 direções cardinais, `x`/`y` não finitos, `playTimeMs` negativo ou não inteiro, `rev` negativo, `savedAt` não ISO, campos extras (strict)
- [X] T004 Implementar `saveSchema`, tipo `Save` e `SAVE_SCHEMA_VERSION = 1` em `packages/shared/src/save/schema.ts` com zod (strictObject), campos: `schemaVersion, name, character, area, x, y, facing, playTimeMs, savedAt, rev`
- [X] T005 [P] Teste de migração em `packages/shared/test/save/migrate.test.ts`: com registro injetado `{1: v1→v2}` migra um save v1 para v2; save na versão atual passa intacto; `schemaVersion` maior que a atual → erro `save-too-new`; falta de passo no registro → erro; entrada não-objeto ou sem `schemaVersion` → erro `invalid`
- [X] T006 Implementar `migrate(raw, { migrations, current })` em `packages/shared/src/save/migrate.ts` (padrões: `migrations = {}` real, `current = SAVE_SCHEMA_VERSION`), aplicando `n → n+1` e depois `saveSchema.safeParse`; retorna `{ ok: true, save } | { ok: false, code: "invalid" | "save-too-new", message }` com o campo e o motivo em PT-BR
- [X] T007 [P] Teste de coerência em `packages/shared/test/save/coherence.test.ts`: com um `WorldLookup` falso, recusa `area` inexistente e `x`/`y` fora dos limites do mapa; aceita posição válida; num schema de teste estendido com `level`, recusa nível 500 (cobre SC-004 antes de existir equipe)
- [X] T008 Implementar `checkCoherence(save, world)` em `packages/shared/src/save/coherence.ts`, retornando `{ ok } | { ok: false, message }`; exportar tudo de `packages/shared/src/save/index.ts`
- [X] T009 [P] Teste das mensagens v4 em `packages/shared/test/game/protocol.test.ts`: `hello` com `save` e `resumeToken?` (sem `name`), `save-ack { rev }`, `welcome` com `resumeToken` e `resumed`, `reject` com códigos `invalid-save | save-too-new | name-taken`, `save { save }`
- [X] T010 Atualizar `packages/shared/src/game/protocol.ts` conforme `contracts/game-protocol-v4.md` e subir `PROTOCOL_VERSION` para 4 em `packages/shared/src/protocol-version.ts`; corrigir os usos de `hello.name` em `packages/server/src/session.ts`, `packages/server/test/harness.ts` e `packages/client/src/net/game-connection.ts` (+ testes) para usar `save.name`
- [X] T011 [P] Teste e implementação de `init { mode: "solo" | "hosted", hostName }`, `listening { port }`, `listen-failed { message }` e `ServerInfo.players/maxPlayers` em `packages/shared/test/server-host-protocol.test.ts`, `packages/shared/src/server-host-protocol.ts` e `packages/shared/src/server-info.ts`
- [X] T012 [P] Adicionar à `SoulSilverApi` e `IpcChannel` os métodos de `contracts/ipc.md` em `packages/shared/src/ipc.ts`, com tipos `SlotSummary` (`status: "ok" | "corrupt" | "unrecoverable" | "empty"`, `name, character, area, playTimeMs, savedAt, backupAvailable`) e `Result = { ok: true } | { ok: false; reason: string }`

**Checkpoint**: contratos compartilhados prontos; testes de shared verdes.

---

## Phase 3: User Story 1 - Novo jogo e continuar (P1) 🎯 MVP

**Goal**: criar save em um dos 3 slots e vê-lo em Continuar após reabrir o app.

**Independent Test**: criar "Gold", fechar e reabrir o app, ver Gold no slot.

- [X] T013 [P] [US1] Teste do store em `packages/app/test/save-store.test.ts` (pasta temporária): `list()` devolve 3 resumos `empty`; `create(1, "Gold", "male")` grava `slot-1.json` com `schemaVersion: 1`, `rev: 0`, `playTimeMs: 0` e a posição inicial do mundo; `create` num slot ocupado sem `overwrite: true` falha; nome inválido falha com motivo
- [X] T014 [US1] Implementar `createSaveStore({ dir, spawn })` em `packages/app/src/main/save-store.ts` com `list`, `create`, `load(slot)` (usa `migrate`), em `app.getPath("userData")/saves`; ponto inicial = o mesmo `START_MAP`/posição usado por `packages/server/src/game-server.ts` (exportar de lá ou de shared, sem duplicar)
- [X] T015 [US1] Registrar os handlers `listSaves`/`createSave` em `packages/app/src/main/index.ts` e expô-los no preload `packages/app/src/preload/` validando argumentos (slot 1..3, `character` no enum)
- [X] T016 [P] [US1] Criar `packages/client/src/MainMenu.svelte` (Novo jogo, Continuar, Hospedar, Entrar, Jogar sozinho; os três últimos desabilitados sem save escolhido, com dica)
- [X] T017 [P] [US1] Criar `packages/client/src/NewGame.svelte` (escolha de slot, nome com limite de 16, personagem masculino/feminino, confirmação para sobrescrever) e `packages/client/src/SaveSlots.svelte` (lista os 3 resumos com nome, personagem, local, tempo, data)
- [X] T018 [US1] Ligar as telas em `packages/client/src/App.svelte`: depois do `FirstRun`, abrir o `MainMenu` em vez de entrar direto no `GameSession`; verificar à mão o cenário 1 de `quickstart.md`

---

## Phase 4: User Story 2 - Jogar sozinho (P1)

**Goal**: entrar no mundo com o save escolhido numa sessão local não anunciada.

**Independent Test**: sessão solo num PC; outro PC não a vê nem conecta por IP.

- [X] T019 [P] [US2] Teste em `packages/server/test/handshake.test.ts`: `hello` com save válido faz spawn em `save.area/x/y/facing`; save inválido (schema) → `reject invalid-save` com motivo; coerência falhando → `invalid-save`; versão nova → `save-too-new`
- [X] T020 [US2] Em `packages/server/src/session.ts`, validar o save no `hello` (`migrate` + `checkCoherence` com o `WorldLookup` da sessão) e usar a posição do save no spawn em vez de `options.spawn`; guardar o save por jogador
- [X] T021 [US2] Em `packages/server/src/game-server.ts` e `packages/app/src/server-host/entry.ts`, aceitar `init.mode`; em `solo`, nenhum socket de rede é aberto
- [X] T022 [US2] Em `packages/app/src/main/server-host.ts` e `packages/app/src/main/index.ts`, implementar `startSolo(slot)`: carrega o save, sobe o servidor em `solo`, conecta pelo IPC local enviando o save no `hello`; atualizar `packages/client/src/net/game-connection.ts` e `packages/client/src/GameSession.svelte` para receber o save de quem inicia a sessão
- [X] T023 [US2] Verificar à mão os cenários 1 e 2 de `quickstart.md`

---

## Phase 5: User Story 3 - Progresso salvo e protegido (P1)

**Goal**: autosave sem ação do jogador, gravação atômica com backup, restaurar backup.

**Independent Test**: matar o processo durante a gravação e reabrir; corromper o arquivo e restaurar o backup.

- [X] T024 [P] [US3] Teste do servidor em `packages/server/test/save-sync.test.ts`: envia `save` a cada 600 ticks, em cada warp e no `leave`; `rev` cresce a cada envio; `playTimeMs` avança com os ticks; posição do save = posição atual
- [X] T025 [US3] Implementar o envio de `save` em `packages/server/src/session.ts` (periódico, warp, leave) e tratar `save-ack`
- [X] T026 [P] [US3] Teste da gravação em `packages/app/test/save-store.test.ts`: `write` substitui o atual e move o anterior para `.bak`; rename injetado que falha deixa atual e `.bak` intactos e apaga o tmp; atual corrompido nunca substitui o `.bak`; `list()` marca `corrupt` com `backupAvailable: true` e `unrecoverable` quando ambos falham; `restoreBackup` copia o `.bak` para o atual; nada corrompido é apagado
- [X] T027 [US3] Implementar `write(slot, save)` e `restoreBackup(slot)` em `packages/app/src/main/save-store.ts` seguindo `contracts/save-file.md` (tmp + fsync + rename atual→.bak + rename tmp→atual, retry em `EPERM`/`EBUSY`/`EACCES` reaproveitando `renameWithRetry` de `packages/extractor/src/fs-atomic.ts` se importável sem puxar o extractor, senão movê-lo para um módulo comum)
- [X] T028 [US3] Em `packages/app/src/main/index.ts`, interceptar `save` vindo do servidor: gravar com `write`, responder `save-ack { rev }`, emitir `game:saved` ao renderer; erro de disco avisa o jogador sem derrubar a sessão
- [X] T029 [US3] Mostrar em `packages/client/src/SaveSlots.svelte` o estado corrompido/irrecuperável e o botão "Restaurar backup"; indicador discreto de "salvo" em `packages/client/src/GameSession.svelte`
- [X] T030 [US3] Verificar à mão os cenários 11 e 12 de `quickstart.md`

---

## Phase 6: User Story 4 - Hospedar e ser encontrado (P2)

**Goal**: partida aberta com um clique, visível na LAN em ≤ 5 s.

**Independent Test**: hospedar num PC e ver a partida noutros PCs em até 5 s.

- [X] T031 [P] [US4] Teste do codec e da lista em `packages/shared/test/lan/discovery.test.ts`: pacote de `contracts/lan-discovery.md` válido; > 512 bytes, `game` diferente ou campos inválidos são ignorados; entrada expira 4 s após o último pacote; `protocolVersion` diferente → desabilitada `"Versão <appVersion>, a sua é <local>"`; `players >= maxPlayers` → `"Cheia"`; mesmo `hostName` com `sessionId` diferentes → duas entradas
- [X] T032 [US4] Implementar `announcement` (zod), `encodeAnnouncement`, `decodeAnnouncement` e `createSessionList({ now, localProtocolVersion })` em `packages/shared/src/lan/discovery.ts`
- [X] T033 [US4] Em `packages/app/src/server-host/entry.ts`, no modo `hosted`, abrir servidor `ws` em `0.0.0.0:47800` (tentar até 47809 se ocupada), ligar cada socket como uma `Connection` em `packages/server/src/game-server.ts`, frames > 1 MB fecham a conexão; reportar `listening`/`listen-failed`
- [X] T034 [US4] Implementar o anunciador em `packages/app/src/main/discovery.ts` (`node:dgram`, broadcast em `255.255.255.255` e no broadcast de cada interface IPv4 não interna, porta 47801, a cada 1 s, com `players` do `ServerInfo`; para ao fechar a sessão)
- [X] T035 [US4] Implementar `startHost(slot)` em `packages/app/src/main/index.ts`/`server-host.ts` e `getSettings`/`markFirewallNoticeSeen` com `userData/settings.json` (`firewallNoticeSeen: boolean`)
- [X] T036 [P] [US4] Criar `packages/client/src/FirewallNotice.svelte`, mostrado só na primeira vez antes do `startHost`; mensagem de `listen-failed` clara
- [X] T037 [US4] Verificar à mão os cenários 3, 4 e 5 de `quickstart.md`

---

## Phase 7: User Story 5 - Entrar na partida (P2)

**Goal**: entrar pela lista ou por IP, com o save validado pelo host.

**Independent Test**: entrar por lista e por IP; save adulterado é recusado com motivo.

- [X] T038 [P] [US5] Teste em `packages/server/test/handshake.test.ts`: segundo `hello` com nome "gold" quando "Gold" está conectado → `reject name-taken` com `"nome já em uso nesta sessão"`; comparação por `trim().toLocaleLowerCase("en")`
- [X] T039 [US5] Implementar nome único em `packages/server/src/session.ts` (contra conectados e reservados)
- [X] T040 [US5] Implementar o ouvinte de descoberta em `packages/app/src/main/discovery.ts` (porta 47801, `createSessionList`, ativo só enquanto `watchSessions` tem assinante) e `joinSession(slot, address)` em `packages/app/src/main/remote-connection.ts`: cliente `ws` para `ip[:47800]`, repassando pelos canais `game:*`, com timeout de conexão de 5 s e erro claro
- [X] T041 [P] [US5] Criar `packages/client/src/JoinGame.svelte`: lista ao vivo (host, IP, jogadores/máximo, versão, desabilitadas com motivo), campo de IP manual, mensagens de recusa
- [X] T042 [US5] Verificar à mão os cenários 5, 6, 7 e 8 de `quickstart.md`

---

## Phase 8: User Story 6 - Queda e fim da sessão (P2)

**Goal**: reconectar sem perder progresso; fim de sessão grava o estado final de todos.

**Independent Test**: derrubar a rede do convidado e voltar; fechar o host e conferir os saves.

- [X] T043 [P] [US6] Teste em `packages/server/test/reconnect.test.ts`: queda sem `leave` reserva o jogador por 2 min (2400 ticks) e remove a entidade; `hello` com mesmo nome + `resumeToken` válido retoma a posição do servidor com `resumed: true`; token errado → `name-taken`; reserva expira e libera o nome; reservados contam para `session-full`
- [X] T044 [US6] Implementar reserva e `resumeToken` (aleatório por jogador, enviado no `welcome`) em `packages/server/src/session.ts`
- [X] T045 [P] [US6] Teste em `packages/server/test/session-close.test.ts`: `close("closed-by-host")` envia `save` a todos, espera os `save-ack` ou 3 s (60 ticks), depois `session-closed`
- [X] T046 [US6] Implementar o estado `closing` em `packages/server/src/session.ts` e `packages/server/src/game-server.ts`; no fechamento normal do app host, aguardar esse fim antes de sair (`packages/app/src/main/index.ts`)
- [X] T047 [US6] No cliente, guardar o `resumeToken` em memória no main (`remote-connection.ts`) e oferecer "Reconectar" ao perder a conexão; host perdido volta ao menu com aviso (`packages/client/src/GameSession.svelte`)
- [X] T048 [US6] Verificar à mão os cenários 9 e 10 de `quickstart.md`

---

## Phase 9: User Story 7 - Exportar e importar (P3)

**Goal**: levar um save para outro PC em arquivo.

**Independent Test**: exportar num PC, importar noutro e continuar.

- [X] T049 [P] [US7] Teste em `packages/app/test/save-store.test.ts`: `exportTo(slot, path)` grava o save; `importFrom(slot, path)` valida e migra antes de gravar, recusa arquivo inválido/corrompido sem alterar o slot, exige `overwrite` para slot ocupado
- [X] T050 [US7] Implementar `exportTo`/`importFrom` em `packages/app/src/main/save-store.ts` e os handlers `exportSave`/`importSave` com `dialog.showSaveDialog`/`showOpenDialog` (filtro `.sssave`) em `packages/app/src/main/index.ts`
- [X] T051 [US7] Botões Exportar/Importar em `packages/client/src/SaveSlots.svelte`; verificar à mão o cenário 13 de `quickstart.md`

---

## Phase 10: Polish

- [X] T052 [P] Atualizar `README.md` com o fluxo de jogo na LAN, portas 47800 (TCP) e 47801 (UDP) e o aviso de firewall
- [X] T053 Rodar `npm test` e `npm run typecheck` (ou equivalentes) em todos os pacotes; rodar o quickstart completo com 2+ PCs

---

## Dependencies

- Setup → Foundational → histórias.
- US1 (save-store, menu) → US2 (sessão solo usa o save) → US3 (autosave usa a sessão).
- US4 depende de US2 (servidor em modo próprio). US5 depende de US4 (WebSocket e descoberta).
- US6 depende de US5 (convidado remoto) e de US3 (envio de `save`).
- US7 depende só de US1.

## Parallel Opportunities

- Foundational: T003, T005, T007, T009, T011, T012 em paralelo (arquivos diferentes).
- US1: T013 com T016/T017 (store e telas).
- US4: T031 e T036 em paralelo com T033.
- US6: T043 e T045 em paralelo.
- US7 pode correr junto com US2–US6 depois de US1.

## Implementation Strategy

1. MVP = Phases 1–5 (US1–US3): jogar sozinho com save seguro, já entregável (princípio XI).
2. Depois US4 + US5: multiplayer na LAN.
3. Depois US6 (robustez) e US7 (export/import).
4. Cada fase termina com testes verdes e a verificação manual indicada.
