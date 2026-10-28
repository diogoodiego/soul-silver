# Tasks: Cutscenes e NPCs

**Input**: `/specs/021-cutscenes-npcs/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: incluídos. O princípio V (test-first) vale para a lógica de NPCs, `busy`, filtro por jogador, protocolo e save: o teste é escrito e falha antes da implementação. Render e UI do cliente são isentos, mas cada mudança visível é verificada à mão. Fixtures sintéticas, sem ROM (princípio II).

**Format**: `- [ ] ID [P?] [Story] Descrição com caminho`. Código e comentários em inglês.

## Phase 1: Setup

- [X] T001 Criar as pastas `packages/shared/src/npc/` e `packages/shared/test/npc/` e o export `@soulsilver/shared/npc` em `packages/shared/package.json` e `packages/shared/src/index.ts`
- [X] T002 Levantar nos dados extraídos (`map-events` dos mapas 60 e 67 e `events-report`) os valores reais de `movement`, o significado de `param`/`xRange`/`yRange` e a lista de comandos de reposicionamento e de câmera usados por introdução, laboratório do Elm, rival e ovo; gravar o resultado em `specs/021-cutscenes-npcs/research.md` (seção R4/R3 "Confirmado") sem commitar dados da ROM

---

## Phase 2: Foundational (bloqueia todas as histórias)

**⚠️ Nenhuma história começa antes desta fase.**

- [X] T003 Escrever teste vermelho de migração em `packages/shared/test/save/migrate-v6.test.ts`: save v5 sobe para v6 com `npcPlacement: {}` sem perder campos; save v6 com `facing` fora de north/south/west/east ou coordenada negativa é recusado
- [X] T004 Implementar save v6 em `packages/shared/src/save/schema.ts` (`SAVE_SCHEMA_VERSION` 5 → 6; `npcPlacement: Record<mapaId, Record<pessoaId, { x, z, facing }>>`, padrão `{}`), `packages/shared/src/save/migrate.ts` e `packages/shared/src/save/coherence.ts`; fazer T003 passar
- [X] T005 Escrever teste vermelho em `packages/shared/test/game/protocol-v14.test.ts`: `request.kind: "cutscene"` aceita `actors` (`person` | `player` | `companion`) e `steps` válidos (`walk`, `face`, `wait`, `jump`, `show`, `hide`, `camera-move`, `camera-lock`, `camera-release`, `camera-shake`), recusa passo desconhecido e contagem negativa; entidade de jogador aceita `data.busy`
- [X] T006 Implementar em `packages/shared/src/game/protocol.ts` e `packages/shared/src/protocol-version.ts` o protocolo 13 → 14 conforme `contracts/protocol-v14.md`; ajustar os testes de handshake para a versão 14; fazer T005 passar
- [X] T007 [P] Definir os tipos `Pattern`, `NpcState` e `CutsceneStep` em `packages/shared/src/npc/types.ts` conforme `data-model.md`

**Checkpoint**: save v6, protocolo 14 e tipos prontos.

---

## Phase 3: User Story 1 — NPCs vivos no mapa (P1) 🎯 MVP

**Meta**: NPCs parados, olhando, vagando e em caminho fixo, com colisão contra mundo, NPCs e jogadores.

**Teste independente**: com `map-events` sintéticos, cada padrão se comporta como definido; no jogo real, New Bark e Cherrygrove conferem com o original.

### Testes (vermelhos primeiro)

- [X] T008 [P] [US1] Testes dos padrões em `packages/shared/test/npc/pattern.test.ts`: `still` não se move nem vira; `look` só troca entre as direções permitidas no intervalo; `wander` nunca sai de `xRange`/`yRange` a partir da origem; `path` cicla pelos passos; mesma semente → mesma sequência; código de `movement` desconhecido → `still` com aviso
- [X] T009 [P] [US1] Testes de colisão em `packages/server/test/npcs.test.ts`: NPC não entra em tile bloqueado da `CollisionMap`, em tile de outro NPC nem de jogador; `path` bloqueado espera e retoma; jogador não atravessa NPC
- [X] T010 [P] [US1] Teste de orçamento em `packages/server/test/npcs-perf.test.ts`: 40 NPCs + 4 jogadores custam ≤ 1 ms por tick

### Implementação

- [X] T011 [US1] Implementar a tabela `movement → Pattern` e o avanço por tick determinístico (RNG de `createRng` semeado por mapa e pessoa) em `packages/shared/src/npc/pattern.ts`, usando os valores confirmados em T002; fazer T008 passar
- [X] T012 [US1] Criar `packages/server/src/npcs.ts`: estado por NPC, avanço no tick de 20 Hz, colisão (T009) e atualização de `facing`/posição via `world.update`; fazer T009 e T010 passar
- [X] T013 [US1] Em `packages/server/src/scripts.ts`, criar o estado do NPC a partir de `npc.movement`, `xRange`, `yRange` e `param` ao carregar o mapa e ligar o tick em `packages/server/src/` (loop principal do servidor)
- [X] T014a [US1] Extrair a tabela do overlay de campo (overlay 1, 0x21ba8: id de sprite do evento → membro de `a/0/8/1`, fim em 0xffff) em `packages/extractor/src/sprites/overworld.ts` (`gfxTable`); os atlas `overworld-npc` e `overworld-pokemon` ganham `gfx` por sprite; estágio `sprites` versão 5. Cobre os 2667 NPCs: personagens de 16 e 32 quadros andam (17 quadros: os 16 primeiros), objetos e folhas de duas paletas são um quadro parado, os protagonistas (ids 0 e 97) vêm do atlas de jogador, e os ids 101–116 usam o sprite da variável 0x4020+n do jogador (`scripts.view`; `GetFriendSprite` grava 239/238)
- [X] T014b [US1] (sprite parado e direção já desenhados para os ids mapeados; falta conferir a caminhada em movimento) Em `packages/client/src/render/game-renderer.ts`, animar o sprite de NPC com caminhada e direção a partir das posições replicadas (interpolação como a dos jogadores); verificar à mão que NPCs aparecem, andam e viram sem sumir nem ficar translúcidos (conferir o NPC que parece esmaecido em Cherrygrove)
  - Nota: NPCs aparecem, andam e viram em New Bark; a figura translúcida é objeto do mapa (ver quickstart).

**Checkpoint**: US1 verificável sozinha em New Bark e Cherrygrove.

---

## Phase 4: User Story 2 — Assistir a cutscenes com movimento e câmera (P1)

**Meta**: `ApplyMovement`, `WaitMovement` e os comandos de câmera executam no cliente de quem disparou; introdução do Prof. Oak após a criação do save.

**Teste independente**: script sintético com movimento e câmera produz o pedido `cutscene` correto, bloqueia até a resposta e retoma; no jogo real, os quatro eventos conferem lado a lado.

### Testes (vermelhos primeiro)

- [X] T015 [P] [US2] Testes dos handlers em `packages/shared/test/script/cutscene.test.ts`: `ApplyMovement` converte a lista de movimento do `script-file` em `steps` (`walk`, `face`, `wait`, `jump`, `show`, `hide`); `WaitMovement` bloqueia até `ack`; comandos de câmera viram passos de câmera; comando de movimento desconhecido → `missing`
- [X] T016 [P] [US2] Testes do servidor em `packages/server/test/scripts-cutscene.test.ts`: o pedido vai só ao jogador que disparou; sem resposta em `SCRIPT_TIMEOUT_TICKS` o script encerra e o jogador é liberado; comando de reposicionamento grava em `npcPlacement` do jogador e sobrevive a salvar e recarregar
  - Nota: testes em `packages/server/test/scripts-cutscene.test.ts` (pedido só para quem disparou, posição final só para ele, timeout, `MovePersonFacing` → `npcPlacement` sobrevive a salvar e reconectar).
- [X] T017 [P] [US2] Teste da introdução em `packages/server/test/scripts-intro.test.ts`: save recém-criado dispara o script de introdução uma vez, com nome e personagem do save, sem nova pergunta; save já iniciado não repete
- [X] T018 [P] [US2] Testes de câmera em `packages/client/test/render/cutscene-camera.test.ts`: mover interpola até o destino no tempo pedido, travar segue o alvo, soltar volta ao jogador, tremer decai à amplitude zero; respeita os limites de `clampCamera`

### Implementação

- [X] T019 [US2] Substituir em `packages/shared/src/script/handlers/bridge.ts` as entradas `ApplyMovement`/`WaitMovement` e os comandos de câmera por handlers reais em `packages/shared/src/script/handlers/cutscene.ts`, registrados na tabela de handlers; fazer T015 passar
- [X] T020 [US2] Em `packages/server/src/scripts.ts`, enviar o pedido `cutscene` só ao jogador do script, listar os `actors`, parar de replicar a ele a posição compartilhada desses NPCs enquanto o pedido estiver aberto e, ao fim, reaplicar a posição final ou o `npcPlacement`; fazer T016 passar
  - Nota: atalho: o servidor continua enviando a posição dos atores; o cliente sobrepõe as poses encenadas enquanto o pedido está aberto. Na resposta, o servidor aplica a posição final (jogador na entidade; pessoas em `moved`, só para esse jogador, até trocar de mapa). Cada `ApplyMovement` é um pedido (atores em sequência, não juntos).
- [X] T021 [US2] Em `packages/server/src/scripts.ts`, aplicar `npcPlacement` no filtro de replicação por jogador (sobrepõe a posição do NPC só para quem tem o registro) e na colisão vista por esse jogador
  - Nota: replicação, interação e colisão usam a visão do jogador (`viewOf`); teste em `scripts-cutscene.test.ts`.
- [X] T022 [US2] Em `packages/server/src/scripts.ts`, marcar a introdução como pendente na criação do save e disparar o script de introdução ao entrar no mundo; fazer T017 passar
  - Nota: a fala do Oak (banco 219: 6, 34, 35, 43, com o nome do save) roda como script sintético em save novo (rev 0, sem tempo de jogo); as perguntas de gênero e nome ficam com o menu de novo jogo. Testes em `scripts-intro.test.ts`.
- [X] T023 [US2] Em `packages/client/src/render/cutscene.ts`, implementar atores locais e a execução dos passos (`walk`, `face`, `wait`, `jump`, `show`, `hide`) com os tempos do original, responder `script-answer` ao fim e ignorar passo desconhecido respondendo na hora
- [X] T024 [US2] Em `packages/client/src/render/camera.ts` e `packages/client/src/render/cutscene.ts`, implementar `camera-move`, `camera-lock`, `camera-release` e `camera-shake`; fazer T018 passar
- [X] T025 [US2] Em `packages/client/src/GameSession.svelte`, bloquear entrada de movimento e interação durante a cutscene (texto continua avançando) e ligar o pedido `cutscene` ao renderer
- [X] T026 [US2] Companheiro: em `packages/server/src/companion.ts` e `packages/client/src/render/cutscene.ts`, incluí-lo como ator quando o script o envolve e mantê-lo parado no lugar quando não
  - Nota: o cliente encena o companheiro quando ele é ator e o servidor o coloca na posição final; fora disso ele segue o jogador, que não se move durante a cena.
- [X] T027 [US2] Opção de texto acelerado das cutscenes: em Configurações (`packages/client/src/`, tela de Configurações) e no apresentador de mensagens, multiplicar a velocidade de texto já configurada, sem nova configuração de velocidade
- [ ] T028 [US2] Verificação manual com a skill `run-soulsilver`: introdução do Prof. Oak, laboratório do Elm, rival e entrega do ovo comparados lado a lado com o original; anotar diferenças em `specs/021-cutscenes-npcs/quickstart.md`

**Checkpoint**: US1 + US2 funcionam em sessão de um jogador.

---

## Phase 5: User Story 3 — Cutscene do amigo não afeta o meu jogo (P1)

**Meta**: o jogador em cutscene aparece como "ocupado" para os outros, que seguem jogando sem interferência; posição permanente é individual.

**Teste independente**: dois jogadores no mesmo mapa; um dispara, o outro não vê nenhum NPC se mover e vê "ocupado".

### Testes (vermelhos primeiro)

- [X] T029 [P] [US3] Testes em `packages/server/test/scripts-isolation-cutscene.test.ts`: jogador B continua recebendo a posição compartilhada dos NPCs durante a cutscene de A; B vê A com `data.busy: true` e sem ele ao fim, timeout ou desconexão; NPC reposicionado para A continua bloqueando B (colisão e replicação); duas cutscenes simultâneas não interferem
  - Nota: cobertos em `scripts-cutscene.test.ts` e `busy-safety.test.ts`.
- [X] T030 [P] [US3] Teste de desconexão em `packages/server/test/scripts-disconnect.test.ts`: jogador sai no meio da cutscene, o runner é descartado, `busy` some e ao reconectar ele não fica travado
  - Nota: em `busy-safety.test.ts` ("a player who leaves mid-cutscene comes back free").

### Implementação

- [X] T031 [US3] Em `packages/server/src/scripts.ts`, definir e limpar `data.busy` na entidade do jogador (início do script de cutscene, fim, timeout, desconexão) e replicá-lo; fazer T029 e T030 passar
  - Nota: `data.busy` já vinha da spec 020; novo `data.cutscene` (abrigo) no jogador e no Pokémon dele, separado de `busy` porque menu e batalha de treinador também usam `busy` e não protegem.
- [X] T032 [US3] Em `packages/client/src/render/game-renderer.ts` e `packages/client/src/GameSession.svelte`, exibir o indicador "ocupado" sobre outros jogadores e na lista Online da equipe; verificar à mão com dois clientes na LAN local
  - Nota: marcador sobre o jogador (spec 017) e "ocupado" na lista Online (por nome).
- [ ] T033 [US3] Verificação manual do critério SC-003 com dois jogadores: A conclui o evento do NPC que sai do caminho, B continua bloqueado

**Checkpoint**: critérios SC-002 e SC-003 verificados.

---

## Phase 6: User Story 4 — Segurança durante a cutscene (P2)

**Meta**: jogador em cutscene não é atingível, não interage e selvagens desistem.

**Teste independente**: com selvagem perseguindo, iniciar cutscene; a ameaça zera e nenhum dano é aplicado.

### Testes (vermelhos primeiro)

- [X] T034 [P] [US4] Testes em `packages/server/test/busy-safety.test.ts`: alvo `busy` não recebe dano de golpe nem de contato; interação de outro jogador com ele é rejeitada; o jogador `busy` não inicia interação com NPC, placa nem item; selvagem com ameaça contra ele a zera e volta a vagar no início da cutscene (`ThreatTable`)
  - Nota: `busy-safety.test.ts` e `busy-combat.test.ts` (sem dano nem empurrão, selvagem solta a ameaça).

### Implementação

- [X] T035 [US4] Em `packages/server/src/combat.ts`, ignorar alvos `busy` em dano, golpes e empurrões
- [X] T036 [US4] Em `packages/server/src/ai.ts` (e `packages/shared/src/ai/`), limpar a ameaça contra jogador `busy` e impedir novo alvo até o fim; fazer T034 passar
- [X] T037 [US4] Em `packages/server/src/scripts.ts`, rejeitar gatilhos, interações e entrada de movimento enquanto `busy`
- [ ] T038 [US4] Verificação manual: selvagem perseguindo → cutscene → ele desiste e não há dano (SC-005)

**Checkpoint**: todas as histórias funcionais.

---

## Phase 7: Polish e transversais

- [X] T039 [P] Rodar `npm run typecheck` e `npx vitest run`; corrigir regressões (lembrar que `perf.test.ts` e `stage.test.ts` têm falhas conhecidas em execução paralela)
- [ ] T040 [P] Passada completa de `specs/021-cutscenes-npcs/quickstart.md` com a skill `run-soulsilver` e registro do resultado
- [X] T041 [P] Registrar no log de comandos faltantes os movimentos/câmeras ainda não suportados encontrados e revisar a cobertura do `events-report` para os quatro eventos
- [X] T042 Rodar `graphify update .` para atualizar o grafo do código

---

## Dependências e ordem de execução

- Setup (Phase 1) → Foundational (Phase 2) → histórias.
- **US1** só depende de Foundational (tipos) e de T002.
- **US2** depende de Foundational e usa os NPCs de US1 como atores (T012/T013) para a verificação visual; a lógica de protocolo e handlers pode começar em paralelo.
- **US3** depende de US2 (`cutscene` e `npcPlacement`).
- **US4** depende de US2 (início/fim do estado de cutscene) e é independente de US3.
- Polish por último.

## Paralelismo

- Foundational: T007 em paralelo com T003–T006.
- US1: T008, T009, T010 juntos.
- US2: T015–T018 juntos; T023 e T024 em arquivos distintos podem andar juntos.
- US3: T029 e T030 juntos. US3 e US4 podem andar em paralelo após US2.

## Estratégia de implementação

1. **MVP**: Setup + Foundational + US1 (NPCs vivos), verificar em New Bark e Cherrygrove.
2. Adicionar US2 (cutscenes), validar a introdução e o laboratório do Elm.
3. Adicionar US3 e US4, validar com dois jogadores e com selvagem.
4. Polish e passada do quickstart.

## Notas

- Cada teste vermelho precisa falhar antes da implementação (princípio V).
- Mudança visível (T014, T023–T028, T032, T033, T038) exige verificação manual antes de ser marcada.
- Depois de modificar código, rodar `graphify update .`.
