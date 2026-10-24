# Implementation Plan: Eventos, scripts, encontros e treinadores

**Branch**: `008-events-scripts-encounters` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-events-scripts-encounters/spec.md`

## Summary

Acrescentar ao pipeline uma etapa `events` que lê, na ROM, os eventos de cada mapa, os scripts, as
tabelas de encontro (e de headbutt) e os times de treinadores, e grava tudo como JSON legível, mais
um relatório de cobertura de scripts. Nada é executado. Decisões em [research.md](./research.md):

1. **Verificação dos formatos (R0)**: concluída; todos os formatos foram conferidos na ROM real e
   a sonda (`events/probe.ts`) fica no código.
2. **Leitores binários próprios e pequenos (R1)**: eventos, encontros, headbutt e treinadores são
   tabelas de campos fixos; sem dependência nova.
3. **Scripts por tabela de comandos (R2)**: um decodificador dirigido por dados (853 comandos em
   `data/script-commands.json`). Comando fora da tabela vira `raw`.
4. **Rótulos de salto (R3)**: desvios viram rótulos nomeados por posição; o script não guarda offsets.
5. **Referências cruzadas (R4)**: texto, espécie, golpe, item e treinador saem pelos identificadores
   das features 005 e 004; a etapa confere cada um.
6. **Contratos em `shared` (R5)**: schemas zod, `formatVersion`, erro com arquivo, campo e problema.
7. **Falha parcial e relatório (R6)**: arquivo de script perdido vai ao relatório; limite de 2%.
8. **Saída e testes (R7)**: determinística; builders sintéticos para cada formato.

## Technical Context

**Language/Version**: TypeScript 6.0 (strict), Node.js 24 LTS (herdados).

**Primary Dependencies**: nenhuma nova. `zod` já está em `shared`.

**Storage**: área de trabalho da 003, etapa `events`: `stages/events/events/` com um JSON por mapa
(`maps/<id>.json`), `scripts/<arquivo>.json`, `encounters.json`, `headbutt.json`, `trainers.json` e `report.json`
(`%APPDATA%\SoulSilver Desktop\extraction\stages\events\` no app; `assets/stages/events/` na CLI).

**Testing**: Vitest (`extractor`, `shared`), com fixtures sintéticos montados por builders (arquivo
de eventos de 1 NPC, 1 warp, 1 gatilho e 1 placa; script de poucos comandos com um desvio e um
comando desconhecido; encontro de 196 bytes; trainer de 20 bytes e time de 2 Pokémon).

**Target Platform**: Windows 10/11 x64 (app e CLI).

**Project Type**: biblioteca + CLI no pacote `extractor`; tipos e schemas em `shared`.

**Performance Goals**: etapa `events` inteira em menos de 60 s na primeira extração (491 arquivos de
evento, 497 arquivos de script, 142 encontros e 738 treinadores); medido: 33 s na ROM real.

**Constraints**:

- saída determinística byte a byte (SC-004): ordem de mapas, eventos e chaves fixa;
- `shared/src/events/` sem APIs do Node, para o servidor e o interpretador usarem os schemas;
- nenhum dado da ROM no repositório; testes sintéticos (princípio II);
- falha de um script não interrompe os demais, dentro do limite do relatório (FR-018);
- tabela de comandos em arquivo de dados, não fixa no código (princípio III).

**Scale/Scope**: 540 mapas, 491 arquivos de evento, 497 arquivos de script (66 mil comandos), 142 tabelas
de encontro, 540 de headbutt, 738 treinadores; 11 arquivos novos no `extractor`, 2 em `shared`.

### Dependências novas (princípio X)

Nenhuma. Rejeitada: biblioteca de decompilação de scripts de NDS (dependência por um formato
simples e sem garantia de determinismo).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Como o plano atende |
|-----------|--------|---------------------|
| I. Conteúdo fiel | ✅ | Eventos, scripts, taxas, níveis e times vêm dos dados da ROM; nada é reescrito. Comando desconhecido é preservado bruto. |
| II. Assets nunca distribuídos | ✅ | JSON nasce em `stages/events/` na máquina do jogador, ignorada e bloqueada pelo hook. Testes sintéticos (R7). Conferência com a ROM real é manual (quickstart §4). |
| III. Data-driven | ✅ | Eventos, scripts, encontros, treinadores e a tabela de comandos são dados com schema validado; erro com arquivo, caminho e problema (`GameDataError` do codec compartilhado). |
| IV. Servidor autoritativo | N/A | A etapa roda no extractor-host; nenhum dado dela decide estado de jogo. |
| V. Test-first | ✅ | Leitores de evento, encontro e treinador, decodificador de scripts, rótulos, resolução de referências, schemas, etapa, relatório e CLI têm testes escritos antes, com fixtures sintéticos. |
| VI. Contratos versionados | ✅ | Tipos e schemas em `shared` ([contracts/events-api.md](./contracts/events-api.md)); `formatVersion` em cada arquivo e no relatório; `version` na etapa. |
| VII. Progresso individual | ✅ | Flags de visibilidade e condições saem com identificador, para o servidor decidir por jogador o que enviar; a etapa não guarda estado de jogador. |
| VIII. Saves | N/A | Sem saves. |
| IX. Segurança do Electron | ✅ | Nenhuma nova superfície de IPC. |
| X. Desempenho e simplicidade | ✅ | Zero dependências novas; tabelas pequenas; decodificador único dirigido por dados. |
| XI. Entrega incremental | ✅ | Marco 1 (extrator); entrega o insumo do interpretador, do spawner e do combate. |
| Restrições técnicas | ✅ | Biblioteca + CLI no `extractor`, Windows apenas, TypeScript strict. |
| Idioma | ✅ | Docs em PT-BR; código, identificadores e logs em inglês. |
| Fluxo de desenvolvimento | ✅ | Typecheck, lint e testes cobrem `extractor` e `shared`. |

**Resultado (pré-pesquisa)**: aprovado.

**Resultado (pós-design)**: aprovado, sem violações. Duas notas:

- **Formato dos scripts**: confirmado no R0 (tabela de ponteiros, comandos de 16 bits, parâmetros
  de 8, 16 e 32 bits); a tabela de comandos vem da decomp pública e foi validada nos 497 arquivos.
- **Mapeamento mapa → script/evento/encontro**: já existe nos cabeçalhos da 006
  (`refs` de `map-headers.json`); a etapa lê esse arquivo. O único campo que não está nele, o level
  script (+8 do cabeçalho), é lido do ARM9 com as constantes de `maps/header.ts`.
- **Fora do que a spec pede, dentro da mesma leitura**: level scripts (gatilhos de carga do mapa) e
  tabelas de headbutt. Os encontros do Safari e do Concurso de Insetos ficam para depois.

## Project Structure

### Documentation (this feature)

```text
specs/008-events-scripts-encounters/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── events-api.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/events/
├── index.ts          # reexporta schemas.ts
└── schemas.ts        # map-events, script-file, encounters, headbutt, trainers, script-commands, events-report

packages/extractor/src/events/
├── zone.ts           # arquivo de eventos do mapa (a/0/3/2) e level scripts
├── script.ts         # decodificador de scripts (a/0/1/2), dirigido pela tabela de comandos
├── command-table.ts  # leitura e validação da tabela de comandos (dados)
├── encounter.ts      # encontros (a/0/3/7) e headbutt (a/2/5/2)
├── trainer.ts        # treinadores e times (a/0/5/5, a/0/5/6)
├── refs.ts           # id de script -> arquivo e entrada; id de script -> treinador
├── layout.ts         # caminhos, faixas de script, chances por espaço, constantes
├── report.ts         # EventsReport + seção da CLI
├── stage.ts          # Stage `events`
└── probe.ts          # sonda R0 (somente contagens)

packages/extractor/data/
└── script-commands.json   # tabela de comandos e de movimentos (dados)
```

**Structure Decision**: segue a organização da 006 e da 007 (pasta por etapa, contrato em `shared`,
sonda R0 no código). A etapa lê os arquivos via `readNarcMember` e os identificadores de
`@soulsilver/shared/game-data` e `/text`, sem copiar tabelas.

## Complexity Tracking

Sem violações a justificar.
