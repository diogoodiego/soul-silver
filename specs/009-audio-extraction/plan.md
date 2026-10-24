# Implementation Plan: Áudio

**Branch**: `009-audio-extraction` | **Date**: 2026-10-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-audio-extraction/spec.md`

## Summary

Acrescentar ao pipeline uma etapa `audio` que lê o arquivo de som da ROM (`gs_sound_data.sdat`:
sequências, bancos de instrumentos e ondas), emula o motor de som do DS no Node e grava o áudio de
cada música, efeito sonoro e cry, mais um índice com os pontos de loop, um relatório e uma página de
reprodução de desenvolvimento. Decisões em [research.md](./research.md):

1. **Verificação do arquivo de som (R0)**: o contêiner, as contagens e o formato do cry já foram
   conferidos; falta fechar o mapeamento espécie e forma → banco de cry e o conjunto real de
   comandos de sequência, antes do código de produção.
2. **Pré-renderizar (R1)**: o emulador roda no extrator e o jogo só toca áudio. Comparadas: WAV PCM
   (1 a 2 GB, estoura a meta), ADPCM (0,4 a 0,6 GB, escolhida) e sequências em tempo real (10 MB,
   mas o emulador teria de rodar no jogo, onde é difícil de testar).
3. **Emulador próprio do motor Nitro (R2)**: contêiner, ondas, intérprete de sequência, canais PCM,
   quadrada e ruído, envelope, LFO, polifonia de 16 canais e mixagem estéreo a 32 kHz, sem
   dependência.
4. **Loop pela segunda passada (R3)**: introdução mais uma volta do loop tirada da segunda
   passada; o loop vai no índice, em amostras.
5. **WAV com IMA ADPCM (R4)**: 32 kHz, estéreo (mono quando os canais são idênticos); decodificador
   pequeno em JavaScript para o jogo e para a página.
6. **Identificação (R5, R6)**: id = índice da sequência no `INFO`; nome do `SYMB`; cry = sequência
   genérica `SEQ_PV` com o banco da espécie.
7. **Paralelismo determinístico (R7)**: `worker_threads` da biblioteca padrão, uma faixa por tarefa.
8. **Reprodutor de desenvolvimento (R8)** e **testes sintéticos (R9)**.

## Technical Context

**Language/Version**: TypeScript 6.0 (strict), Node.js 24 LTS (herdados).

**Primary Dependencies**: nenhuma nova. `zod` já está em `shared`; `node:worker_threads`, `node:fs`
da biblioteca padrão; a página de reprodução é HTML e JavaScript puros (Web Audio).

**Storage**: área de trabalho da 003, etapa `audio`: `stages/audio/audio/` com `index.json`,
`report.json` e um WAV por faixa em `music/`, `jingle/`, `effect/` e `cry/`
(`%APPDATA%\SoulSilver Desktop\extraction\stages\audio\` no app; `assets/stages/audio/` na CLI).

**Testing**: Vitest (`extractor`, `shared`), com fixtures sintéticos montados por builders (SDAT de
uma sequência, um banco e uma onda; SSEQ por comando; SWAV PCM8, PCM16 e ADPCM).

**Target Platform**: Windows 10/11 x64 (app e CLI).

**Project Type**: biblioteca + CLI no pacote `extractor`; tipos e schemas em `shared`; reprodutor
de desenvolvimento local.

**Performance Goals**:

- etapa `audio` inteira em menos de 10 minutos em 4 núcleos na primeira extração (10 000 a 15 000 s
  de música, 1 500 s de efeitos, 600 s de cries, a medir no R0); o render passa de 30 vezes o tempo
  real por núcleo;
- a página abre a lista (cerca de 1 900 faixas) e começa a tocar uma faixa em menos de 1 s.

**Constraints**:

- saída determinística byte a byte (SC-005): ordem fixa, render sem relógio e sem estado
  compartilhado entre faixas, WAV sem campos variáveis;
- `shared/src/audio/` sem APIs do Node, para o jogo usar os schemas e o decodificador;
- nenhum áudio nem dado da ROM no repositório; testes sintéticos (princípio II);
- áudio extraído abaixo de 1 GB (meta; o relatório mostra o tamanho);
- falha de uma faixa não interrompe as demais, dentro do limite do relatório (FR-017); os 493
  cries não admitem perda.

**Scale/Scope**: 1 372 sequências (358 músicas e jingles, 1 006 efeitos), 519 ou mais cries,
778 bancos, 8,6 MB de entrada; cerca de 1 900 arquivos de áudio; 14 arquivos novos no `extractor`,
4 em `shared`, 1 página HTML.

### Dependências novas (princípio X)

Nenhuma. Rejeitadas: bibliotecas de decodificação de SDAT ou de síntese (sem garantia de
determinismo e sem o controle de fidelidade que o motor exige), `ffmpeg` e codificadores de Opus ou
Vorbis (binário nativo ou WASM para ganhar disco que a meta de 1 GB não exige).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Como o plano atende |
|-----------|--------|---------------------|
| I. Conteúdo fiel | ✅ | Notas, tempos, instrumentos e loops vêm do arquivo de som da ROM; o emulador segue o motor do original, sem recompor nada. A conferência lado a lado é o critério (SC-001). |
| II. Assets nunca distribuídos | ✅ | WAV e JSON nascem em `stages/audio/` na máquina do jogador, ignorada e bloqueada pelo hook. Testes sintéticos (R9). Conferência com a ROM real é manual (quickstart §4 a §6). |
| III. Data-driven | ✅ | Índice e relatório são JSON com schema validado ao gravar e ao carregar; erro com arquivo, caminho e problema. As tabelas do motor ficam em `tables.ts` como dados documentados. |
| IV. Servidor autoritativo | N/A | A etapa roda no extractor-host; áudio não decide estado de jogo. |
| V. Test-first | ✅ | Contêiner, ondas, intérprete, tabelas, canais, mixagem, loop, ADPCM, índice, etapa, relatório e CLI têm testes escritos antes, com fixtures sintéticos. A página de reprodução (UI) é verificada manualmente (quickstart §4). |
| VI. Contratos versionados | ✅ | Tipos, schemas e decodificador em `shared` ([contracts/audio-api.md](./contracts/audio-api.md)); `formatVersion` no índice e no relatório; `version` na etapa. |
| VII. Progresso individual | N/A | Sem estado de jogador. |
| VIII. Saves | N/A | Sem saves. |
| IX. Segurança do Electron | ✅ | Nenhuma nova superfície de IPC. A página é HTML local em `127.0.0.1`, somente leitura, fora do app. |
| X. Desempenho e simplicidade | ✅ | Zero dependências novas; o jogo só decodifica e toca buffers (60 fps e orçamento do tick intactos). Complexidade do emulador justificada no R1 e no R2. |
| XI. Entrega incremental | ✅ | Marco 1 (extrator); entrega o insumo da música e dos sons do núcleo. |
| Restrições técnicas | ✅ | Biblioteca + CLI no `extractor`, Windows apenas, TypeScript strict. |
| Idioma | ✅ | Docs em PT-BR; código, identificadores e logs em inglês. |
| Fluxo de desenvolvimento | ✅ | Typecheck, lint e testes cobrem `extractor` e `shared`. |

**Resultado (pré-pesquisa)**: aprovado.

**Resultado (pós-design)**: aprovado, sem violações. Três notas:

- **Fidelidade só se prova ouvindo**: os testes sintéticos provam tabelas, tom, envelope, tempo e a
  emenda do loop; o timbre final de cada faixa só se confere no SC-001 (manual). O R2 lista o que o
  emulador cobre para que uma lacuna apareça como diferença audível localizada, não como surpresa.
- **Mapeamento dos cries (R0)**: confirmado no código do jogo: banco = espécie; Shaymin Céu usa o
  banco 494.
- **Meta de 1 GB**: medido na ROM real: 399 MB, extração em cerca de 3,5 minutos.

## Project Structure

### Documentation (this feature)

```text
specs/009-audio-extraction/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── audio-api.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/audio/
├── index.ts          # API do contrato audio-api.md
├── schemas.ts        # AUDIO_FORMAT_VERSION, AUDIO_SAMPLE_RATE, tipos de faixa; audio-index, audio-report; parse*, serialize*
└── adpcm.ts          # decodificador IMA ADPCM e leitura do WAV (sem APIs do Node)

packages/extractor/src/audio/
├── sdat.ts           # contêiner: SYMB, INFO, FAT, FILE
├── sseq.ts           # intérprete de sequência (faixas, notas, comandos, laços)
├── sbnk.ts           # banco de instrumentos (PCM, quadrada, ruído, percussão, divisão por teclas)
├── swar.ts           # arquivos de ondas: PCM8, PCM16, IMA ADPCM, loop
├── tables.ts         # tabelas de conversão do motor (ataque, decaimento, sustentação, volume, pan)
├── synth.ts          # canais, envelope, LFO, polifonia, mixagem estéreo a 32 kHz
├── render.ts         # render de uma faixa: introdução, loop pela segunda passada, mono ou estéreo
├── wav.ts            # codificador IMA ADPCM e gravação do WAV
├── worker.ts         # trabalhador do render (worker_threads)
├── cries.ts          # espécie e forma -> banco; render do cry
├── report.ts         # AudioReport + resumo para a CLI
├── stage.ts          # Stage `audio`
└── probe.ts          # sonda R0 (somente contagens)

packages/extractor/src/viewer/
├── audio.html        # reprodutor de desenvolvimento (somente dev)
├── audio-run.ts      # npm run audio:view
└── serve.ts          # (existente) ganha o tipo .wav
```

**Structure Decision**: segue a organização da 006 a 008 (pasta por etapa, contrato em `shared`, sonda
R0 no código, visualizador em `viewer/`). O decodificador ADPCM mora em `shared` porque o jogo
(feature 26) e a página precisam dele; o codificador mora no extrator.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Emulador do motor de som (cerca de 2 000 linhas) no extrator | A música do DS só existe como sequências e instrumentos; sem emular o motor não há trilha sonora fiel | Tocar as sequências em MIDI padrão perde o timbre e o envelope originais e falha o SC-001; a opção em tempo real exige o mesmo emulador, num lugar mais difícil de testar |
