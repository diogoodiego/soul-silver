# Modelo de dados: Áudio

**Feature**: [spec.md](./spec.md) | **Plano**: [plan.md](./plan.md) | **Pesquisa**: [research.md](./research.md)

Todos os arquivos ficam em `stages/audio/audio/` e têm `kind` e `formatVersion` (princípio VI). Os
tipos e schemas vivem em `shared/src/audio/`; o envelope e o codec são os da feature 004.

## Layout de saída

```text
audio/
├── index.json          # audio-index
├── report.json         # audio-report
├── music/<id>.wav      # músicas (id = índice da sequência no arquivo de som)
├── jingle/<id>.wav     # jingles (sequências SEQ_ME_*)
├── effect/<id>.wav     # efeitos sonoros (sequências SEQ_SE_*)
└── cry/<espécie>.wav   # cries; formas com cry próprio: <espécie>-<forma>.wav
```

Os números nos nomes de arquivo têm 4 dígitos para músicas, jingles e efeitos, e 3 para a espécie.

## WAV

Arquivo `RIFF/WAVE` com IMA ADPCM (`wFormatTag` 0x11), `nSamplesPerSec` 32 000, 1 ou 2 canais
(`nChannels`), `nBlockAlign` 1024, `wBitsPerSample` 4, bloco `fact` com o número de amostras e
bloco `data`. Cada bloco traz, por canal, o preditor (16 bits), o índice de passo (8 bits) e o
byte reservado, seguidos das amostras de 4 bits, intercaladas por canal de 4 bytes em 4 bytes (a
estrutura padrão do ADPCM do WAV). Faixas com os dois canais idênticos saem em mono. O WAV não
guarda loop; o loop está no índice.

## audio-index (`index.json`)

| Campo | Tipo | Regra |
|-------|------|-------|
| `sampleRate` | int | `AUDIO_SAMPLE_RATE` = 32 000 |
| `tracks` | `Track[]` | ordenadas por `id` crescente, ids únicos |
| `cries` | `Cry[]` | ordenados por `species` e `form` crescentes |

### Track (música, jingle ou efeito)

| Campo | Tipo | Regra |
|-------|------|-------|
| `id` | id | índice da sequência no arquivo de som; é o identificador que os cabeçalhos de mapa (006) e os scripts (008) usam. As sequências de cry (1 a 3) e os marcadores `SEQ_BGM_END` e `SEQ_SE_END` não são faixas |
| `name` | string | nome da sequência (`SEQ_GS_TITLE`), ou `SEQ_<id>` quando o arquivo não dá nome |
| `kind` | enum | `music`, `jingle` ou `effect` |
| `file` | string | caminho relativo do WAV, `<kind>/<id>.wav` |
| `channels` | 1 ou 2 | |
| `samples` | int ≥ 1 | amostras por canal no WAV; com loop, introdução mais uma volta |
| `loop` | `{ start, end }` ou nulo | em amostras, `0 ≤ start < end ≤ samples`; nulo para faixa sem loop |
| `bytes` | int | tamanho do WAV |

Uma faixa com loop toca de `0` até `end`, volta para `start` e repete `start` a `end` sem fim; a
introdução é o trecho de `0` a `start` e toca uma vez só.

### Cry

| Campo | Tipo | Regra |
|-------|------|-------|
| `species` | 1 a 493 | espécie (feature 004) |
| `form` | int ≥ 0 | forma (0 = base); só as formas com cry próprio |
| `bank` | id | índice do banco de instrumentos usado |
| `file` | string | `cry/<espécie>.wav` ou `cry/<espécie>-<forma>.wav` |
| `channels` | 1 ou 2 | |
| `samples` | int ≥ 1 | |
| `bytes` | int | |

Um cry não tem loop. Uma forma que o original não distingue não entra em `cries`: quem pede o cry
dela recebe o da forma 0 (o relatório lista o caso).

## audio-report (`report.json`)

| Campo | Tipo | Regra |
|-------|------|-------|
| `ok` | boolean | falso se algum dos 493 cries se perdeu ou mais de 2% das demais faixas se perderam |
| `counts` | objeto | `music`, `jingle`, `effect`, `cry`: faixas gravadas |
| `bytes` | objeto | `total`, `music`, `jingle`, `effect`, `cry` |
| `unconverted` | lista | `{ kind, id, name, reason }` de cada faixa que não saiu |
| `missingCries` | lista | `{ species, reason }` de cada espécie sem cry |
| `fallbackCries` | lista | `{ species, form }` das formas resolvidas pela forma base |
| `missingForMaps` | lista | `{ map, field, id }` de cada `musicDay` ou `musicNight` sem faixa |
| `missingForScripts` | lista | `{ file, command, id }` de cada música, efeito ou cry citado por script sem faixa |
| `loopless` | lista | ids de música sem loop (as que o original não repete) |

O relatório não guarda tempos de execução (a saída é idêntica byte a byte); o tempo vai ao log.

## Transições de estado

Nenhuma: os arquivos são produzidos de uma vez pela etapa e só lidos depois.
