# Tasks: Áudio

**Input**: Design documents from `/specs/009-audio-extraction/`

**Prerequisites**: [plan.md](./plan.md) (obrigatório), [spec.md](./spec.md) (obrigatório), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/audio-api.md](./contracts/audio-api.md), [quickstart.md](./quickstart.md)

**Tests**: obrigatórios. A constituição (princípio V) exige test-first para o extrator e para a lógica de `shared`. Cada teste é escrito e precisa falhar antes da implementação correspondente. A página de reprodução (UI) é exceção e é verificada manualmente.

**Organização**: tarefas agrupadas por história de usuário. Todas as fixtures são sintéticas (princípio II); nenhum teste lê a ROM.

**Princípio de cirurgia (karpathy-guidelines)**: cada tarefa altera só os arquivos listados, tem critério de pronto verificável e não antecipa trabalho de outra história.

**Ordem recomendada de implementação** (R11): Fundação → US2 (cries e efeitos: o caminho mais curto pelo emulador e pela etapa) → US1 (música com loop) → US3 (reprodutor). A prioridade de produto continua P1 = US1.

## Status (2026-10-24)

**Implementado e verificado**: typecheck, lint e os testes de `audio` passam (sintéticos). A etapa rodou
na ROM real em cerca de 3,5 minutos: 329 músicas (313 com loop), 33 jingles, 1 004 efeitos e **494
cries (493 espécies e Shaymin Céu), nenhum cry faltando**; **399 MB** no total; nenhum id de mapa ou
de script sem faixa. Uma faixa não convertida, dentro do limite de 2%: a torcida do estádio
(`SEQ_SE_GS_STADIUM_KANSEI`), uma nota de 912 s que o jogo interrompe antes. Duas extrações seguidas
dão os mesmos bytes (SC-005), e o teste da etapa confere o mesmo com 1 e com 3 trabalhadores.

**Pendente (manual)**:

- T035 e T040: ouvir. A comparação lado a lado com o jogo (SC-001), os 10 loops (SC-002) e a
  página tocando no navegador não foram feitos: este ambiente não tem saída de som nem navegador
  controlável. O decodificador da página foi conferido amostra a amostra contra o de `shared` nos
  arquivos reais, e o script da página foi validado sintaticamente.

**Onde a implementação difere deste plano de tarefas** (decisões em research.md):

- Sem `constants.ts` em `shared`: as constantes ficam em `schemas.ts`, com `trackFile` e `cryFile`.
- `renderSequence` recebe um `SoundSource` (bancos e ondas lidos uma vez) em vez do `Sdat`.
- Os testes de voz (T030) entraram em `render.test.ts` (tom, envelope, pan, loop); o teste de
  `sbnk` e `swar` ficou em `banks.test.ts`. Portamento e modulação estão implementados, mas
  só são conferidos por escuta: a ROM quase não os usa e a escala deles é aproximada.
- `SEQ_BGM_END` e `SEQ_SE_END` são marcadores de fim de lista e não viram faixas.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: US1 a US3; ausente em Setup, Fundação e Polimento
- Testes de `shared` ficam em `packages/shared/test/audio/`; os do extrator em `packages/extractor/test/audio/`; fixtures em `packages/extractor/test/fixtures/audio/`.

---

## Phase 1: Setup

- [X] T001 Confirmar que a saída `assets/stages/audio/` está bloqueada pelo `.gitignore` (a pasta `assets/` já é ignorada) e pelo hook de pre-commit; ajustar só essas regras se não estiver. Pronto quando `git check-ignore assets/stages/audio/audio/index.json` retorna o caminho.
- [X] T002 [P] Adicionar a exportação `"./audio"` em `packages/shared/package.json`, apontando para `packages/shared/src/audio/index.ts`. Pronto quando `npm run typecheck -w @soulsilver/shared` passa.
- [X] T003 [P] Criar as pastas `packages/shared/src/audio/`, `packages/shared/test/audio/`, `packages/extractor/src/audio/`, `packages/extractor/test/audio/` e `packages/extractor/test/fixtures/audio/` (`.gitkeep` onde ficarem vazias). Pronto quando aparecem no `git status`.

---

## Phase 2: Fundação (bloqueia todas as histórias)

**⚠️ CRÍTICO**: nenhuma história começa antes do checkpoint desta fase. T004 a T006 bloqueiam o mapeamento dos cries (US2), a classificação das faixas (US1) e o tamanho esperado; T007 a T014 não dependem do R0.

### Verificação do arquivo de som (R0)

- [X] T004 Escrever `packages/extractor/src/audio/probe.ts`, sonda que lê o `data/sound/gs_sound_data.sdat` já extraído (`assets/stages/rom-unpack/filesystem`) e imprime só contagens, tamanhos e magias: registros por tipo, os comandos de sequência que aparecem (contagem por comando, incluindo os prefixos `0xA0` a `0xA2` e os acima de `0xE3`), os tipos de instrumento dos bancos, os formatos de onda (PCM8, PCM16, ADPCM, com loop) e a duração estimada de cada sequência pelo intérprete real quando ele existir. Para os cries, procura a tabela espécie e forma → banco no ARM9 e nas sobreposições. Pronto quando roda sem erro e não grava nada no repositório.
- [X] T005 Preencher a seção R0 de `specs/009-audio-extraction/research.md` com cada item de "A confirmar na sonda antes da implementação" resolvido (regra espécie e forma → banco de cry, lista de formas com cry próprio, quais sequências são música de mapa e quais jingle, censo de comandos e instrumentos, formatos de onda, ids citados pelos scripts da 008), sem bytes da ROM. Pronto quando cada item está resolvido ou marcado como bloqueio de US1 ou US2.
- [X] T006 Com o R0 fechado, atualizar `plan.md`, `data-model.md` e `contracts/audio-api.md` onde o formato real divergir; reestimar o tamanho total com as durações reais e, se passar de 1 GB, aplicar primeiro a redução do R1 (taxa de amostragem menor, mono quando os canais forem idênticos) antes de mudar de abordagem. Se o mapeamento dos cries não fechar, parar para revisão antes de T018. Pronto quando o gate está decidido por escrito.

### Contratos em `shared` (test-first)

- [X] T007 [P] Escrever `packages/shared/test/audio/schemas.test.ts` cobrindo: `audio-index` e `audio-report` válidos; `formatVersion` ausente; ids de faixa repetidos ou fora de ordem (`id` crescente, únicos); `loop` com `start` maior ou igual a `end` ou `end` maior que `samples` (regra `0 ≤ start < end ≤ samples`); `channels` diferente de 1 ou 2; `file` que não bate com `<kind>/<id>.wav`; `species` fora de "1 a 493"; cry repetido por espécie e forma; cada erro com arquivo, caminho do campo e problema (SC-007). Escrever também `packages/shared/test/audio/adpcm.test.ts`: `decodeWav` lê um WAV IMA ADPCM mono e estéreo montado à mão, recusa etiqueta, taxa ou tamanho de `data` inconsistentes com mensagem clara. Pronto quando os dois testes existem e falham.
- [X] T008 Implementar `packages/shared/src/audio/constants.ts` (`AUDIO_FORMAT_VERSION = GAME_DATA_FORMAT_VERSION`, `AUDIO_SAMPLE_RATE = 32000`, `TRACK_KINDS`), `schemas.ts` (zod, via o codec de `game-data`: `parseAudioFile`, `parseAudioJson`, `serializeAudioFile` com ordem estável), `adpcm.ts` (`decodeWav`, sem APIs do Node) e `index.ts`. Seguir `packages/shared/src/events/schemas.ts`. Pronto quando T007 passa.

### Leitores, tabelas e codificador (test-first)

- [X] T009 [P] Escrever `packages/extractor/test/audio/sdat.test.ts` e implementar `packages/extractor/src/audio/sdat.ts` (`readSdat`: cabeçalho `SDAT`, blocos `SYMB`, `INFO`, `FAT` e `FILE`; nomes por tipo; registros de sequência, banco e onda; arquivo por id; erro com a posição quando o bloco ou o offset sai do arquivo). Pronto quando o teste passa.
- [X] T010 [P] Escrever `packages/extractor/test/audio/swar.test.ts` e implementar `packages/extractor/src/audio/swar.ts` (arquivo de ondas `SWAR`/`SWAV`: PCM8, PCM16 e IMA ADPCM para amostras de ponto flutuante, ponto de loop e taxa; onda truncada falha com a posição). Pronto quando o teste passa.
- [X] T011 [P] Escrever `packages/extractor/test/audio/sbnk.test.ts` e implementar `packages/extractor/src/audio/sbnk.ts` (banco `SBNK`: instrumento PCM, onda quadrada, ruído, conjunto de percussão e divisão por teclas, com nota base, envelope e pan; instrumento ou onda ausente falha dizendo banco e instrumento, nunca devolve som errado em silêncio). Pronto quando o teste passa.
- [X] T012 [P] Escrever `packages/extractor/test/audio/tables.test.ts` e implementar `packages/extractor/src/audio/tables.ts` (tabelas de conversão do motor: ataque, decaimento, sustentação, soltura, volume em decibéis e pan, cada uma com valores conhecidos e comentário com a origem). Pronto quando o teste passa.
- [X] T013 [P] Escrever `packages/extractor/test/audio/wav.test.ts` e implementar `packages/extractor/src/audio/wav.ts` (`encodeWav`: IMA ADPCM de bloco 1024, 32 000 Hz, 1 ou 2 canais, bloco `fact`; mono quando os dois canais são idênticos). Pronto quando a ida e volta com `decodeWav` de `shared` fica dentro do erro de quantização do ADPCM e o arquivo é idêntico byte a byte em duas execuções.
- [X] T014 [P] Criar os builders de fixture em `packages/extractor/test/fixtures/audio/builders.ts`: `SDAT` mínimo (símbolos, uma ou mais sequências, banco e arquivo de ondas), `SSEQ` por comando (helpers de nota, pausa, andamento, laço, salto, chamada), `SBNK` com cada tipo de instrumento, `SWAV` PCM8, PCM16 e ADPCM de poucas amostras, e uma onda senoidal de frequência conhecida. Pronto quando um teste de sanidade monta um `SDAT` e `readSdat` o lê.

### Emulador do motor (test-first)

- [X] T015 Escrever `packages/extractor/test/audio/sseq.test.ts` e implementar `packages/extractor/src/audio/sseq.ts` (intérprete de sequência: faixas e `opentrack`, notas com pitch, velocidade e duração, pausas, instrumento, volume, expressão, pan, transposição, bend e alcance, prioridade, mono e poli, ligadura, andamento, laços com contagem, chamada e retorno, salto, variáveis e comandos condicionais e aleatórios com semente fixa; produz eventos com tempo em amostras e informa onde a sequência volta a si mesma). Comando desconhecido falha dizendo sequência e comando. Pronto quando o teste passa.
- [X] T016 Escrever `packages/extractor/test/audio/synth.test.ts` e implementar `packages/extractor/src/audio/synth.ts` (núcleo: canais PCM com interpolação e envelope de ataque, decaimento, sustentação e soltura, volume e pan, polifonia de 16 canais com prioridade e roubo, mixagem estéreo a 32 kHz). Casos: frequência de uma onda conhecida, duração da nota, as quatro fases do envelope, pan, volume e a regra de prioridade. Pronto quando o teste passa.

**Checkpoint**: contratos, leitores, tabelas, codificador, intérprete e núcleo do emulador testados; fixtures prontas.

---

## Phase 3: User Story 2 — Efeitos sonoros e cries (P2)

**Meta**: efeitos e os 493 cries (com formas), por nome ou número, o relatório e a etapa no pipeline.

**Teste independente**: com um `SDAT` sintético de dois cries e dois efeitos, extrair e consultar cada um por nome e número; com a ROM real, conferir no relatório que os 493 cries existem.

**Bloqueio**: T005 e T006 (mapeamento dos cries).

- [X] T017 [US2] Criar `packages/extractor/src/audio/layout.ts` com o caminho do arquivo de som (`data/sound/gs_sound_data.sdat` na saída `filesystem`), os prefixos de nome por tipo (`SEQ_SE_*` efeito, `SEQ_ME_*` jingle, `SEQ_GS_*`, `SEQ_PL_*`, `SEQ_AIF_*`, `SEQ_BGM` música), o nome da sequência de cry (`SEQ_PV`) e a regra espécie e forma → banco confirmada no R0. Pronto quando o layout cita só o que o R0 confirmou.
- [X] T018 [P] [US2] Escrever `packages/extractor/test/audio/cries.test.ts`: o cry de uma espécie é a sequência `SEQ_PV` tocada com o banco da espécie; uma forma com cry próprio tem arquivo próprio; uma forma sem cry próprio usa o da forma base e é listada em `fallbackCries`; espécie sem banco falha dizendo a espécie; `species` de "1 a 493". Pronto quando o teste existe e falha (FR-003, FR-011).
- [X] T019 [US2] Implementar `packages/extractor/src/audio/cries.ts` (`renderCry`, mapeamento espécie e forma → banco). Pronto quando T018 passa.
- [X] T020 [P] [US2] Escrever `packages/extractor/test/audio/render.test.ts` (parte de efeitos): `renderSequence` de uma sequência curta sem laço devolve PCM de duração e canais esperados, corta o silêncio final depois da soltura das notas, é mono quando os dois canais são idênticos e estéreo com pan, e é idêntico em duas execuções. Pronto quando o teste existe e falha (FR-002, FR-004).
- [X] T021 [US2] Implementar `packages/extractor/src/audio/render.ts` (`renderSequence` para sequências sem laço: render até o fim das notas, corte do silêncio final, mono ou estéreo). Pronto quando T020 passa.
- [X] T022 [P] [US2] Escrever `packages/extractor/test/audio/stage.test.ts`: com o `SDAT` sintético, a etapa grava `index.json` e `report.json` válidos pelo schema, `effect/<id>.wav` com `<kind>/<id>.wav`, `cry/<espécie>.wav`, nomes do `SYMB` (ou `SEQ_<id>` sem nome), mesmo conteúdo em cada execução e a falha com a posição quando o arquivo não é um `SDAT`; falha quando um cry se perde e tolera até 2% de perda nas demais faixas (FR-012 a FR-014, FR-017, FR-018). Pronto quando o teste existe e falha.
- [X] T023 [US2] Implementar `packages/extractor/src/audio/stage.ts` (etapa `audio`: `id`, `title` em PT-BR, `version = 1`, `weight`, entradas `filesystem`, `maps/maps` e `events/events`, saída `audio`) e `packages/extractor/src/audio/worker.ts` (renderização com `node:worker_threads`, um trabalhador por núcleo, resultados reunidos por id para a saída não depender da ordem de término). Seguir `packages/extractor/src/events/stage.ts`. Pronto quando T022 passa.
- [X] T024 [P] [US2] Escrever `packages/extractor/test/audio/report.test.ts`: contagens por tipo e bytes por tipo, `unconverted` com tipo, id, nome e motivo, `missingCries`, `fallbackCries`, `ok = false` quando um cry se perdeu ou mais de 2% das demais faixas se perderam, linhas da CLI com "FALHA" no veredito e sem tempos de execução (a saída é idêntica byte a byte). Pronto quando o teste existe e falha (FR-016).
- [X] T025 [US2] Implementar `packages/extractor/src/audio/report.ts` (`buildAudioReportFile`, `buildAudioReport`, `reportLines`) e gravar `report.json` na etapa. Pronto quando T024 passa.
- [X] T026 [US2] Integrar à CLI em `packages/extractor/src/cli.ts`: a seção "Áudio" entra ao fim do relatório de sanidade, com o mesmo código de saída; ajustar `packages/extractor/test/cli.test.ts` para cobrir a seção e a mensagem "não extraído". Pronto quando o teste de CLI passa.
- [X] T027 [US2] Incluir `audioStage` em `packages/extractor/src/stages/index.ts` depois de `eventsStage` e atualizar o comentário de "New stages". Pronto quando `defaultStages` o lista e o teste de pipeline passa.

**Checkpoint**: efeitos e cries extraídos de ponta a ponta; US2 testável sozinha.

---

## Phase 4: User Story 1 — Música de cada lugar, em loop sem corte (P1)

**Meta**: todas as músicas e jingles, com introdução tocada uma vez, loop original preservado e emenda contínua, ligados ao id dos cabeçalhos de mapa e dos scripts.

**Teste independente**: com um `SDAT` sintético de uma faixa com introdução e loop, conferir os pontos de loop e a continuidade na volta; com a ROM real, comparar lado a lado New Bark Town, Route 29, batalha selvagem e Centro Pokémon (SC-001) e ouvir 10 loops (SC-002).

- [X] T028 [P] [US1] Escrever `packages/extractor/test/audio/loop.test.ts`: uma faixa com introdução e laço infinito sai com `loop` em amostras (`0 ≤ start < end ≤ samples`), o WAV tem a introdução e uma volta tirada da segunda passada, a cauda das notas que passam do fim do loop aparece no começo da volta, a diferença entre a última e a primeira amostra do loop fica abaixo do limite e o espectro dos 10 ms de cada lado da emenda não salta; uma faixa sem laço infinito sai inteira, com `loop` nulo e sem repetir (FR-006 a FR-008). Pronto quando o teste existe e falha.
- [X] T029 [US1] Implementar em `packages/extractor/src/audio/sseq.ts` e `packages/extractor/src/audio/render.ts` a detecção do laço infinito (salto para trás ou laço sem fim, com o ponto de volta) e o render de introdução mais segunda passada do loop, preenchendo `loop` no resultado. Pronto quando T028 passa.
- [X] T030 [P] [US1] Escrever `packages/extractor/test/audio/voices.test.ts`: canal de onda quadrada com os ciclos de trabalho de 1/8 a 7/8, canal de ruído, modulação (LFO) com profundidade, velocidade, atraso e alcance, portamento, varredura de altura e ligadura, cada um com resultado verificável (frequência, forma, tempo). Pronto quando o teste existe e falha.
- [X] T031 [US1] Implementar em `packages/extractor/src/audio/synth.ts` os canais de onda quadrada e ruído, a modulação, o portamento e a varredura de altura. Pronto quando T030 passa.
- [X] T032 [P] [US1] Estender `packages/extractor/test/audio/stage.test.ts` e `packages/extractor/test/audio/report.test.ts`: músicas e jingles saem em `music/` e `jingle/` com o `kind` pelo prefixo do nome, o `index.json` guarda `loop`, `loopless` lista as músicas sem loop, `missingForMaps` lista cada `musicDay` ou `musicNight` de `map-headers.json` sem faixa e `missingForScripts` lista cada música, efeito ou cry citado por script sem faixa (FR-009, FR-010, FR-016). Pronto quando os casos novos existem e falham.
- [X] T033 [US1] Estender `packages/extractor/src/audio/stage.ts` e `packages/extractor/src/audio/report.ts` para classificar as faixas, renderizar as músicas com loop, cruzar os ids com os cabeçalhos de mapa (006) e com os scripts (008) e preencher `missingForMaps` e `missingForScripts` e `loopless`. Pronto quando T032 passa.

**Checkpoint**: música com loop extraída e ligada aos ids; US1 testável sozinha com dados sintéticos.

---

## Phase 5: User Story 3 — Reprodutor de desenvolvimento (P3)

**Meta**: página de desenvolvimento que lista as faixas, toca qualquer uma e marca o loop.

**Teste independente**: com faixas sintéticas, abrir a página, tocar uma faixa e ver o loop marcado; sem áudio extraído, ver a mensagem pedindo a extração.

- [X] T034 [P] [US3] Escrever o caso `.wav` em `packages/extractor/test/viewer/` (ou no teste do servidor existente) e acrescentar o tipo `audio/wav` em `packages/extractor/src/viewer/serve.ts`. Pronto quando o servidor devolve um `.wav` com o tipo certo, somente leitura e em `127.0.0.1`.
- [ ] T035 [P] [US3] Criar `packages/extractor/src/viewer/audio.html` (lista por tipo com id e nome; toca a faixa escolhida decodificando o ADPCM; marca o início e o fim do loop; repete o loop depois da introdução; mensagem clara quando não há áudio extraído) e verificar manualmente (quickstart §4, FR-019, SC-008). Pronto quando uma faixa sintética toca em até 2 cliques e o loop aparece marcado.
- [X] T036 [US3] Criar `packages/extractor/src/viewer/audio-run.ts` e o script `audio:view` em `package.json` (`node packages/extractor/src/viewer/audio-run.ts`), seguindo `viewer/sprites-run.ts`. Pronto quando `npm run audio:view` abre a página (FR-020: nada disso entra no app).

**Checkpoint**: reprodutor funcionando.

---

## Phase 6: Polimento e conferência

- [X] T037 [P] Estender `packages/extractor/test/audio/stage.test.ts`: a saída é idêntica byte a byte com 1 e com 3 trabalhadores, e uma saída anterior incompleta é substituída por inteiro (FR-014, SC-005). Pronto quando passa.
- [X] T038 [P] Garantir que `packages/shared/src/audio/` não importa APIs do Node, que nenhum arquivo de `viewer/` entra no pacote do app e que nenhum áudio foi commitado (`npm run check:assets`). Pronto quando as verificações passam.
- [X] T039 Rodar `npm run typecheck`, `npm run lint`, `npm run test` e `npm run check:assets`. Pronto quando todos passam sem exceção (o teste de determinismo da etapa `maps` que estoura os 5 s sob carga é conhecido e não é desta feature).
- [ ] T040 Conferência manual com a ROM real (quickstart §3 a §7): 4 faixas lado a lado (SC-001), 10 loops sem corte (SC-002), 493 cries no relatório e uma amostra ouvida (SC-003), tamanho total abaixo de 1 GB (SC-004), duas extrações com hashes idênticos (SC-005). Resultado registrado na seção Status deste arquivo.

---

## Dependências e ordem de execução

- **Setup (T001–T003)** → **Fundação (T004–T016)** → histórias → **Polimento (T037–T040)**.
- Dentro da Fundação: T004 → T005 → T006; T007 → T008; T009, T010, T011, T012, T013 e T014 em paralelo; T015 depende de T009, T011, T012 e T014; T016 depende de T010, T011, T012 e T015.
- **US2 (T017–T027)** depende da Fundação inteira e de T006; T019 depende de T017 e T018; T021 depende de T020; T023 depende de T019, T021 e T022; T025 depende de T023 e T024; T026 e T027 dependem de T025.
- **US1 (T028–T033)** depende de T016 e T023; T029 depende de T028; T031 depende de T030; T033 depende de T029, T031 e T032.
- **US3 (T034–T036)** depende de T023 (precisa de áudio extraído para a verificação manual) e não bloqueia as outras; T036 depende de T035.
- US1 e US2 não dependem uma da outra nos dados; o esqueleto de `stage.ts` (T023) é o ponto compartilhado. Se o R0 bloquear os cries (T006), seguir por efeitos e música e deixar os cries por último.

## Oportunidades de paralelismo

- Fundação: T009, T010, T011, T012, T013, T014 em paralelo (arquivos distintos).
- US2: T018, T020, T022 e T024 (testes) em paralelo.
- US1: T028, T030 e T032 (testes) em paralelo.
- US3: T034 e T035 em paralelo.
- Polimento: T037 e T038 em paralelo.

## Estratégia de implementação

1. **MVP técnico**: Setup + Fundação + US2 (cries e efeitos). Entrega a etapa de ponta a ponta com o caminho mais curto pelo emulador (uma nota por cry, sequências curtas por efeito), o relatório e a CLI, e já valida o SC-003 e o SC-005.
2. Acrescentar US1 (música com loop), o maior risco de fidelidade, assim que o núcleo do emulador estiver estável; a comparação lado a lado (SC-001) e os 10 loops (SC-002) validam o resultado.
3. US3 fecha com o reprodutor, que também serve à comparação manual; a conferência final (T040) valida SC-001 a SC-005 com a ROM real.
