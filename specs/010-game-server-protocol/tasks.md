# Tasks: Servidor de jogo e protocolo

**Input**: `specs/010-game-server-protocol/` (plan.md, spec.md, research.md, data-model.md, contracts/game-protocol.md, quickstart.md)

**Tests**: obrigatórios (princípio V — test-first). Cada teste é escrito e falha antes da implementação correspondente.

**Format**: `[ID] [P?] [Story] Descrição`

## Phase 1: Setup

- [X] T001 Add `"./game": "./src/game/index.ts"` to exports in packages/shared/package.json and create empty barrel packages/shared/src/game/index.ts
- [X] T002 [P] Create packages/client/test/net/ folder and confirm packages/client/vitest.config.ts includes `test/**/*.test.ts`

---

## Phase 2: Foundational (bloqueia todas as histórias)

- [X] T003 [P] Write failing tests for seeded RNG (same seed → same sequence; different seed → different; `nextFloat` in [0,1); `nextInt(n)` in [0,n)) in packages/shared/test/game/rng.test.ts
- [X] T004 Implement `createRng(seed: uint32)` with sfc32 in packages/shared/src/game/rng.ts (research R8)
- [X] T005 [P] Define `EntityKind = "player" | "pokemon" | "projectile" | "wild"`, `Entity { id, kind, area: string, x, y, facing: Direction, data: Record<string, string|number|boolean> }`, `EntityDelta` (id + changed fields) and `diffEntity(prev, next)` in packages/shared/src/game/entity.ts, with tests in packages/shared/test/game/entity.test.ts
- [X] T006 [P] Write failing tests for `stepMovement(entity, input, collision)`: fixed speed per tick, `dir: null` stays put, blocked by solid `CollisionCell` per axis (slides along walls), updates `facing` in packages/shared/test/game/movement.test.ts
- [X] T007 Implement `stepMovement` in packages/shared/src/game/movement.ts using `CollisionCell`/`MAP_TILE_PX` from packages/shared/src/maps (research R7)
- [X] T008 Write failing tests for every message in contracts/game-protocol.md (valid parse, missing field, wrong type, unknown `type`, `name` length "1–16", `seq` int ≥ 0) in packages/shared/test/game/protocol.test.ts
- [X] T009 Implement zod schemas `clientMessage` (`hello`, `input`, `leave`) and `serverMessage` (`welcome`, `reject`, `state`, `debug`, `session-closed`) plus `parseClientMessage`/`parseServerMessage` returning `{ok, msg} | {ok:false, error}` in packages/shared/src/game/protocol.ts
- [X] T010 Bump `PROTOCOL_VERSION` to 2 in packages/shared/src/protocol-version.ts and update any test asserting 1 (grep `PROTOCOL_VERSION` across packages/*/test)
- [X] T011 Export rng, entity, movement, protocol from packages/shared/src/game/index.ts
- [X] T012 [P] Add `Connection { send(msg), onMessage(cb), onClose(cb), close() }` and `createMemoryConnectionPair()` (optional artificial delay in ticks) in packages/server/src/connection.ts, with test in packages/server/test/connection.test.ts
- [X] T013 [P] Write failing tests for tick metrics (last/avg/max over last 100 ticks, overrun count) in packages/server/test/tick-metrics.test.ts, then implement packages/server/src/tick-metrics.ts
- [X] T014 Measure each `onTick` duration with `performance.now()` in packages/server/src/tick-loop.ts and feed tick-metrics; extend existing packages/server/test/tick-loop.test.ts

**Checkpoint**: contratos, movimento e RNG prontos e testados.

---

## Phase 3: User Story 1 — Partida simulada com clientes falsos (P1) 🎯 MVP

**Goal**: sessão de 1–4 jogadores, handshake versionado, inputs numerados, estado incremental filtrado por área, mensagens inválidas descartadas.

**Independent Test**: 4 clientes em memória entram, enviam inputs por N ticks; posições conferem; 5º é recusado; lixo não derruba nada.

### Tests (escrever primeiro, devem falhar)

- [X] T015 [P] [US1] Session lifecycle tests: create → open; join up to 4; 5th gets `reject session-full`; `leave`/connection close removes entity and notifies others in area; host leaving closes with `session-closed host-left`; last leaving closes with `empty`; join after close gets `reject session-closed`; 200 ticks without messages = leave — in packages/server/test/session.test.ts
- [X] T016 [P] [US1] Handshake tests: other version → `reject protocol-mismatch` with message "Versão do protocolo incompatível: servidor {S}, cliente {C}. Atualize o jogo." and connection closed; non-`hello` before handshake discarded and logged — in packages/server/test/handshake.test.ts
- [X] T017 [P] [US1] Input tests: one input consumed per tick; `seq ≤ lastInputSeq` ignored; out-of-order processed by seq; queue "máx. 10" drops oldest and logs; `state.lastInput` reports last processed seq — in packages/server/test/inputs.test.ts
- [X] T018 [P] [US1] Replication tests: first `state` has `full: true` with all relevant entities; later states carry only changed fields in `changed`, new in `spawned`, gone in `removed`; nothing sent for unchanged entity — in packages/server/test/replication.test.ts
- [X] T019 [P] [US1] Relevance tests: client never receives entity from another area (SC-007); entity entering area arrives in `spawned`, leaving in `removed` — in packages/server/test/relevance.test.ts
- [X] T020 [P] [US1] Malformed tests: 1,000 garbage messages (non-objects, wrong types, huge strings) from one client; server keeps ticking and other clients' states are identical to a control run (SC-005) — in packages/server/test/malformed.test.ts

### Implementation

- [X] T021 [US1] Implement world (entity store, ids never reused, add/remove/get by area) in packages/server/src/world.ts
- [X] T022 [US1] Implement `isRelevant(player, entity)` (same area; single extension point for flags, principle VII) in packages/server/src/relevance.ts
- [X] T023 [US1] Implement per-player replication (`sent` map, build `state` with spawned/changed/removed, `full` on first send and area change) in packages/server/src/replication.ts
- [X] T024 [US1] Implement session in packages/server/src/session.ts: `createSession({ seed, collision, log })`, `connect(conn)`, `step()` (consume inputs → `stepMovement` → replicate → send), lifecycle states `open|closed`, host = first player, timeout 200 ticks, validation via `parseClientMessage` with log of conn id + reason
- [X] T025 [US1] Host the session in packages/server/src/game-server.ts: tick loop calls `session.step()`; status includes `metrics`; send `debug` to clients once per second (every 20 ticks)
- [X] T026 [US1] Add host channel messages `client-open {connId}`, `client-message {connId, msg}`, `client-close {connId}` and `client-send {connId, msg}`, `client-kick {connId}` plus `metrics` in status, with validators and tests, in packages/shared/src/server-host-protocol.ts and packages/shared/test
- [X] T027 [US1] Bridge renderer ↔ server process: typed IPC channel in packages/shared/src/ipc.ts, preload exposure in packages/app/src/preload/index.ts, forwarding by connId in packages/app/src/main/server-host.ts (update its tests)
- [X] T028 [US1] Export new modules from packages/server/src/index.ts

**Checkpoint**: US1 testável sozinha com `npx vitest run packages/server`.

---

## Phase 4: User Story 2 — Resposta imediata ao controle (P1)

**Goal**: previsão local com reconciliação suave.

**Independent Test**: cliente com latência de 100 ms move no mesmo quadro do input; divergência forçada converge sem salto.

- [X] T029 [P] [US2] Prediction tests: input applied locally immediately (SC-003); confirmed inputs dropped on `state.lastInput`; pending inputs replayed on server position; no visible correction when server agrees; visual error decays in ~100 ms; error > 2 tiles snaps — in packages/client/test/net/prediction.test.ts
- [X] T030 [US2] Implement `createPredictor(collision)` in packages/client/src/net/prediction.ts using `stepMovement` from @soulsilver/shared/game (research R4)
- [X] T031 [US2] Implement game connection in packages/client/src/net/game-connection.ts: send `hello`, handle `welcome`/`reject` (expose reject message for UI), send one `input` per local tick with increasing seq, apply `state` to local entity map, validate with `parseServerMessage` and drop+log invalid
- [X] T032 [US2] Test game-connection against a real session via memory connection with 2-tick delay in packages/client/test/net/game-connection.test.ts

---

## Phase 5: User Story 3 — Outros jogadores suaves (P2)

**Goal**: entidades remotas interpoladas 100 ms no passado.

**Independent Test**: estados a 20 Hz com jitter ±30 ms produzem posição contínua.

- [X] T033 [P] [US3] Interpolation tests: render time = latest − 100 ms; linear between bracketing states; holds last position when no newer data (no extrapolation); jitter ±30 ms has no jumps (SC-006) — in packages/client/test/net/interpolation.test.ts
- [X] T034 [US3] Implement `createInterpolator()` in packages/client/src/net/interpolation.ts (research R5)
- [X] T035 [US3] Route remote entities through the interpolator and own entity through the predictor in packages/client/src/net/game-connection.ts

---

## Phase 6: User Story 4 — Gravar e reproduzir (P3)

**Goal**: replay chega ao mesmo estado final.

**Independent Test**: gravar sessão de 4 clientes, reproduzir sem conexões, comparar hash.

- [X] T036 [P] [US4] Define recording schema `{ protocolVersion, seed, events: { tick, kind: "join"|"leave"|"input", playerId, name?, input? }[] }` in packages/shared/src/game/recording.ts with tests
- [X] T037 [P] [US4] Replay tests: 4 clients, 600 ticks of random-but-seeded inputs with joins/leaves, replay hash equals original (SC-002); recording with other protocolVersion rejected with clear message — in packages/server/test/replay.test.ts
- [X] T038 [US4] Implement recorder (hook into session join/leave/input-consumed per tick) and `replay(recording, collision)` returning final world in packages/server/src/recorder.ts; add stable `hashWorld(world)` in packages/server/src/world.ts
- [X] T039 [US4] Add determinism guard test: no `Math.random` or `Date.now` in packages/server/src/{session,world,replication,relevance,recorder}.ts — in packages/server/test/determinism.test.ts

---

## Phase 7: Polish

- [X] T040 Performance test: 4 clients moving continuously for 1,200 ticks, worst tick < 10 ms (SC-001) in packages/server/test/perf.test.ts
- [X] T041 [P] Debug panel overlay toggled by F3 showing tick and last/avg/max ms from `debug` messages in packages/client/src/DebugPanel.svelte, mounted in packages/client/src/App.svelte (manual check per principle V)
- [X] T042 [P] Show the `reject` message (version mismatch) to the player in packages/client/src/App.svelte
- [X] T043 Run `npm test` and `npm run typecheck`, then the manual steps in specs/010-game-server-protocol/quickstart.md

---

## Dependencies

- Setup → Foundational → US1 → (US2, US4 in parallel) ; US3 after US2 (shares game-connection.ts) → Polish
- T004 after T003; T007 after T006; T009 after T008; T024 after T021–T023; T025 after T024; T027 after T026

## Parallel Examples

- Foundational: T003, T005, T006, T008, T012, T013 together
- US1 tests: T015–T020 together, then T021/T022 in parallel
- After US1: US2 (T029–T032) and US4 (T036–T039) by different people

## Implementation Strategy

1. MVP = Phases 1–3: sessão autoritativa testada com clientes falsos.
2. + US2: jogo solo jogável sem atraso.
3. + US3: multiplayer visualmente suave (rede real na feature 12).
4. + US4: ferramenta de depuração.

## Implementation Notes

- T009: callers use the zod schemas directly (`clientMessage.safeParse`, `serverMessage.safeParse`) instead of `parse*` wrappers.
- T014: tick duration is measured in `game-server.ts` around `session.step()`; `tick-loop.ts` is unchanged.
- T025/T026: tick metrics reach clients through the `debug` message only; the host `status` message is unchanged.
- `session-closed` has no `"empty"` reason: the host is always the first player, so "last player leaves" is `host-left`.
- T012: the in-memory connection is synchronous; latency tests hold messages in the test (`client/test/net/game-connection.test.ts`).
- Known shortcuts (`shortcut:` comments): fixed spawn and no collision in the app until world loading (spec 011); ledges/ladders walkable; entity `data` resent whole on change; interpolation clock offset has no drift correction.
