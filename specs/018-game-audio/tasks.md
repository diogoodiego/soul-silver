# Tasks: Áudio no jogo

**Input**: Design documents from `/specs/018-game-audio/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: obrigatórios para a lógica pura (princípio V, FR-022). Cada teste é escrito antes da
implementação e falha até ela existir. Fixtures sintéticos (índice de áudio e cues inventados),
nunca arquivos da ROM (princípio II). Escuta e desempenho são conferidos à mão (FR-023, quickstart).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: US1 música de lugar, US2 batalha e fanfarra, US3 efeitos, US4 cries, US5 volumes

---

## Phase 1: Setup

- [X] T001 Criar `packages/shared/src/audio/cues.ts`, `director.ts` e `mixer.ts` vazios e exportá-los em `packages/shared/src/audio/index.ts`; criar a pasta `packages/client/src/audio/`
- [X] T002 [P] Registrar em `docs/balance-log.md` as decisões de apresentação: crossfade 800 ms (research R2), atenuação linear até 12 tiles, pan pela tela, prioridades ui/own = 3, cry de terceiro = 2, efeito de terceiro = 1 e limite de 16 vozes (R6), cry de desmaio a 0,85× (R10), som de golpe por `cues.json` com fallback do arquétipo (R5)

---

## Phase 2: Foundational (bloqueia todas as histórias)

- [X] T003 [P] Teste do schema de cues em `packages/shared/test/audio/cues.test.ts`: aceita o exemplo de [contracts/audio-cues.md](contracts/audio-cues.md); rejeita `kind` diferente de `"audio-cues"`, `effects` sem alguma das 15 `EffectCue`, `defaultMove` ausente, `mix.crossfadeMs` fora de "inteiro 0–5000", `mix.rangeTiles` fora de "inteiro 1–64", `mix.maxVoices` fora de "inteiro 4–64", `mix.faintCryRate` fora de "número 0,5–1"; o erro diz arquivo, caminho e problema; `trackByName` mapeia nome → faixa de um `audio-index` sintético
- [X] T004 Schema `audioCuesFile` e `parseAudioCues`, `EFFECT_CUES` (`hit`, `hit-super`, `hit-weak`, `faint`, `ball-throw`, `ball-shake`, `ball-catch`, `ball-escape`, `door`, `warp`, `level-up`, `evolution`, `menu-cursor`, `menu-confirm`, `menu-cancel`) e `trackByName` em `packages/shared/src/audio/cues.ts`, com o envelope e o codec de `game-data` (`createGameDataCodec`)
- [X] T005 Criar `content/audio/cues.json` com nomes conferidos contra o `audio-index` extraído (listar com `npm run audio:view`): `music.title`, `music.wildBattle` (tipo `music`), `music.victory` (tipo `jingle`), as 15 `effects`, `defaultMove`, um som por arquétipo de `content/combat/archetypes.json` e `mix` com os padrões 800/12/16/0,85
- [X] T006 Carregador em `packages/client/src/audio/loader.ts`: lê `assets://stages/audio/audio-index.json` e `content/audio/cues.json` (pelo mesmo caminho que o cliente já usa para `content/`), valida com `parseAudioFile`/`parseAudioCues`, busca WAV por `trackFile`/`cryFile`, decodifica com `decodeWav` num Web Worker (`packages/client/src/audio/decode-worker.ts`) e guarda `AudioBuffer` em cache (cries em LRU de 64); faixa ausente ou WAV inválido → `console.warn` com o nome e `undefined`, nunca exceção (FR-021)
- [X] T007 Motor em `packages/client/src/audio/engine.ts` com a API de [contracts/audio-cues.md](contracts/audio-cues.md): um `AudioContext` criado no primeiro gesto do usuário, buses `master → music | effects` (`GainNode`), e `setVolumes`, `setListener`; sem dispositivo de áudio ou contexto falhando → todas as chamadas viram no-op
- [X] T008 Expor o carregador e o motor como o singleton `audio` em `packages/client/src/audio/index.ts`

**Checkpoint**: cues validados e o motor carrega e toca um buffer.

---

## Phase 3: User Story 1 - Música de cada lugar (Priority: P1) 🎯 MVP

**Goal**: título e música do mapa por período, com crossfade e sem reiniciar a mesma faixa.

**Independent Test**: New Bark Town → Route 29 → laboratório, ouvindo as trocas (quickstart 1–4).

- [X] T009 [P] [US1] Teste de `desiredMusic` em `packages/shared/test/audio/director.test.ts`: `screen: "title"` → `title`; no jogo, `night: false` → `musicDay`, `night: true` → `musicNight`; dois mapas com o mesmo `musicDay` devolvem o mesmo id (o motor não reinicia); id 0 ou sem faixa → `null`
- [X] T010 [US1] `MusicState` e `desiredMusic` (sem combate ainda) em `packages/shared/src/audio/director.ts`, conforme [data-model.md](data-model.md) "Estado de música"
- [X] T011 [US1] `setMusic(trackId)` em `packages/client/src/audio/engine.ts`: mesma faixa = no-op; outra → dois `GainNode` com rampa linear de `mix.crossfadeMs`; pedido no meio de um crossfade para a faixa que sai e recomeça do ganho atual (R2); `AudioBufferSourceNode.loop` com `loopStart = loop.start / sampleRate` e `loopEnd = loop.end / sampleRate`, e `loop: null` toca uma vez (FR-004)
- [X] T012 [US1] Tocar a música de título em `packages/client/src/screens/Title.svelte` via `audio.setMusic`
- [X] T013 [US1] Em `packages/client/src/GameSession.svelte`, ao mudar a área do próprio jogador: ler `musicDay`/`musicNight` do header (via `packages/client/src/render/map-assets.ts`), fixar `night` por `timeOfDay` no momento da entrada, chamar `audio.preloadArea` com as músicas do mapa, a batalha selvagem e a fanfarra (R7) e `audio.setMusic(desiredMusic(...))`

**Checkpoint**: SC-001 e SC-005 conferíveis à mão.

---

## Phase 4: User Story 2 - Música de batalha e fanfarra (Priority: P1)

**Goal**: batalha selvagem em até 1 s; fanfarra só na vitória; cada cliente pelo próprio estado.

**Independent Test**: combate com selvagem, vencer, capturar e fugir; segundo jogador por perto fora do combate (quickstart 5 e 8).

- [X] T014 [P] [US2] Ampliar `packages/shared/test/audio/director.test.ts`: `inCombat` → `wildBattle`; `victory` → `victory` mesmo com `inCombat: false`; `screen: "title"` vence tudo; ao sair de `victory` volta ao mapa
- [X] T015 [US2] Combate e vitória em `desiredMusic` em `packages/shared/src/audio/director.ts` (prioridade título → vitória → batalha → mapa, R3)
- [X] T016 [US2] Em `packages/client/src/GameSession.svelte`: passar `inCombat` (já calculado) ao diretor; marcar `wonThisCombat` ao receber `exp-gain` com `inCombat`; na saída do combate com `wonThisCombat`, `victory = true` até o `ended` da fanfarra (o motor expõe `onEnded` em `setMusic`); trocar de área ou entrar em novo combate zera `victory` (R4, edge cases)

**Checkpoint**: SC-002 conferível; música não depende de outros jogadores (FR-008).

---

## Phase 5: User Story 3 - Efeitos de combate, captura e interface (Priority: P1)

**Goal**: golpes, acertos por efetividade, Poké Ball, portas e warps, nível, evolução e menus, com distância, pan e limite de vozes.

**Independent Test**: golpes com e sem som próprio, acertos de efetividades diferentes, captura e escape, menus (quickstart 6 e 8).

- [X] T017 [P] [US3] Teste de `moveSound` em `packages/shared/test/audio/cues.test.ts`: `moves[id]` primeiro, depois `archetypes[archetype]`, depois `defaultMove`
- [X] T018 [P] [US3] Teste do mixer em `packages/shared/test/audio/mixer.test.ts`: `source: "ui"` e `"own"` → ganho 1, pan 0, prioridade 3; `"other"` a `d` px → ganho `1 − d / rangePx`, `undefined` com `d ≥ rangePx`; pan `−1` na borda esquerda, `1` na direita, limitado; cry de terceiro prioridade 2, efeito de terceiro 1; `admitVoice` devolve `"free"` abaixo do limite, o índice da voz de menor prioridade (desempate por menor ganho) quando a nova é maior, e `"drop"` quando não é; um próprio nunca é substituído por um de terceiro
- [X] T019 [P] [US3] `moveSound` em `packages/shared/src/audio/cues.ts`
- [X] T020 [P] [US3] `mixSound` e `admitVoice` em `packages/shared/src/audio/mixer.ts` (R6)
- [X] T021 [US3] `play(cue, req)` em `packages/client/src/audio/engine.ts`: resolve cue → faixa, aplica `mixSound`, `StereoPannerNode` e `admitVoice` com `mix.maxVoices`; a voz roubada para com `stop()`
- [X] T022 [US3] Reações em `packages/client/src/audio/reactions.ts`, ligadas em `packages/client/src/GameSession.svelte`, conforme a tabela de [contracts/game-protocol-v10.md](contracts/game-protocol-v10.md): entidade nova com `data.move` → `moveSound` (e marca o golpe como tocado; sem entidade, primeiro `combat-event` daquele `move`); `combat-event` `kind: "hit"` → `hit-super` (> 1), `hit` (= 1), `hit-weak` (< 1); `data.hp` indo a 0 → `faint`; entidade nova com `data.ball` → `ball-throw`; `capture` → `ball-shake` por balançada e `ball-catch` ou `ball-escape`; troca de `area` do próprio jogador → `door` ou `warp`; `progression` de nível → `level-up`, de evolução → `evolution`; `source` é `"own"` quando o atacante, o dono ou o jogador é o local, senão `"other"`; o listener é o centro da câmera a cada quadro
- [X] T023 [US3] Sons de menu em `packages/client/src/input/menu.ts`: mover o cursor → `menu-cursor`, confirmar → `menu-confirm`, cancelar → `menu-cancel`, com `source: "ui"`
- [X] T024 [US3] Pré-carregar no início da sessão todos os efeitos de `cues.json` (`effects`, `moves`, `archetypes`, `defaultMove`) em `packages/client/src/audio/loader.ts`

**Checkpoint**: SC-003 conferível com 4 jogadores.

---

## Phase 6: User Story 4 - Cries dos Pokémon (Priority: P2)

**Goal**: cry ao lançar, ao desmaiar e quando um selvagem agressivo nota o jogador.

**Independent Test**: lançar, desmaiar, aproximar-se de um selvagem agressivo (quickstart 7).

- [X] T025 [P] [US4] Teste em `packages/server/test/wild.test.ts`: um selvagem que entra em `chase` tem `data.alert === true` no estado replicado; ao sair de `chase`, a chave some
- [X] T026 [US4] `data.alert` em `packages/server/src/wild.ts` nas transições de `w.ai` para e de `"chase"`
- [X] T027 [P] [US4] `PROTOCOL_VERSION = 10` em `packages/shared/src/protocol-version.ts` e atualizar o teste de versão, se houver, conforme [contracts/game-protocol-v10.md](contracts/game-protocol-v10.md)
- [X] T028 [US4] Cries em `packages/client/src/audio/reactions.ts`: entidade `pokemon` nova com `data.owner` de jogador → cry da espécie e forma; `data.hp` a 0 → cry com `rate: mix.faintCryRate`; `data.alert` indo a `true` → cry do selvagem com `source: "other"` (prioridade 2); `audio.preloadCry` quando a espécie aparece no estado (R7)

---

## Phase 7: User Story 5 - Volumes nas Configurações (Priority: P2)

**Goal**: volume geral, de música e de efeitos, e silenciar sem foco, imediatos e persistentes.

**Independent Test**: mudar cada volume, reabrir o app (quickstart 9).

- [X] T029 [P] [US5] Teste em `packages/shared/test/settings.test.ts`: `audio` padrão `{ master: 80, music: 80, effects: 80, muteUnfocused: false }`; `readSettings` com `audio` inválido (ex.: `music: 83`, `master: 120`) devolve o padrão; `settingsPatch` aceita `audio` válido e rejeita "inteiro 0–100, múltiplo de 5" violado
- [X] T030 [US5] Campo `audio` em `packages/shared/src/settings.ts` (`fields` e `DEFAULT_SETTINGS`)
- [X] T031 [US5] Em `packages/client/src/settings.ts`, `apply()` chama `audio.setVolumes(next.audio)`; ganho = `master/100 × (music ou effects)/100`
- [X] T032 [US5] Seção Áudio em `packages/client/src/screens/Settings.svelte` com três controles de 0 a 100 em passos de 5 e o liga/desliga de silenciar sem foco, salvando por `saveSettings({ audio })` a cada mudança; textos em `packages/client/src/i18n/`
- [X] T033 [US5] Silenciar sem foco em `packages/client/src/audio/engine.ts`: `blur`/`focus` da janela levam o bus `master` a 0 e de volta, quando `muteUnfocused`

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T034 Conferir que `npm test` passa em `packages/shared` e `packages/server` sem a ROM
- [ ] T035 [P] Medir 60 fps com 4 jogadores em combate (overlay de debug) e ajustar `mix.maxVoices` em `content/audio/cues.json` se o som ficar confuso (SC-003)
- [ ] T036 Rodar o [quickstart.md](quickstart.md) inteiro no app (skill `run-soulsilver`) e anotar resultados em `docs/balance-log.md`

---

## Dependencies & Execution Order

- Setup (T001–T002) → Foundational (T003–T008) → histórias.
- US1 (T009–T013) é o MVP. US2 depende de US1 (amplia o diretor e o fluxo de música).
- US3 depende só da Foundational. US4 usa `play` de US3 (T021). US5 depende só de T007.
- Polish por último.

## Parallel Opportunities

- T002 com T001; T003 com T006–T007.
- Depois da Foundational, US1, US3 e US5 podem andar em paralelo.
- Dentro de US3: T017, T018, T019, T020 juntos; dentro de US4: T025 e T027 juntos.

```text
# US3 em paralelo
T017 moveSound test      T018 mixer test
T019 moveSound           T020 mixSound/admitVoice
```

## Implementation Strategy

1. MVP: Setup + Foundational + US1 → música de lugar com crossfade (SC-001, SC-005).
2. US2 → batalha e fanfarra (SC-002).
3. US3 → efeitos com mixer (SC-003).
4. US4 e US5 → cries e volumes (SC-004).
5. Polish: quickstart completo com a ROM.
