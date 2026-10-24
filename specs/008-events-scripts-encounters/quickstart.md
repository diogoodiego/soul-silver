# Quickstart: validação de eventos, scripts, encontros e treinadores

**Feature**: [spec.md](./spec.md) | **Plano**: [plan.md](./plan.md) | **Contrato**: [contracts/events-api.md](./contracts/events-api.md)

Roteiro para validar a feature de ponta a ponta. A ROM real nunca entra nos testes; os passos 3 a 5
usam a ROM do desenvolvedor apenas na conferência manual.

## Pré-requisitos

- Node.js 24 LTS e dependências instaladas (`npm install`).
- A ROM do SoulSilver (EUA) já extraída pela 003 e pelas etapas 004, 005 e 006.
- Verificação dos formatos (R0) concluída e registrada em [research.md](./research.md).

## 1. Testes automatizados

```bash
npm run test -w @soulsilver/shared
npm run test -w @soulsilver/extractor
```

Esperado: todos os testes de `events` passam com fixtures sintéticos
(`test/fixtures/events/`).

## 2. Typecheck e lint

```bash
npm run typecheck
npm run lint
```

Esperado: sem erros.

## 3. Extração e relatório de cobertura (SC-002)

```bash
npm run extract -- --rom "<ROM>.nds" --stages events
npm run extract -- --report
```

Esperado: a etapa `events` conclui (cerca de 30 s); a seção "Eventos, scripts, encontros e
treinadores" mostra 100% dos arquivos de script decodificados, os comandos mais usados e nenhum
comando desconhecido. O relatório completo, com cada comando, as ocorrências e os mapas, está em
`assets/stages/events/events/report.json`. Qualquer comando desconhecido aparece em `unknownCommands`.

## 4. Conferência de cenas contra o jogo original (SC-001)

Abrir `maps/<id>.json` e os `scripts/<arquivo>.json` referenciados (campo `script.file`) de New Bark
Town (mapa 60), do laboratório do Prof. Elm e da Route 29 (mapa 33), e comparar com o jogo
original: os mesmos eventos, na mesma ordem (NPCs, warps, gatilhos, falas e movimentos). O texto
de uma fala é o identificador `BBBB:I` do catálogo da 005.

## 5. Conferência de encontros e treinadores (SC-003)

Comparar com fontes de referência: as tabelas de encontro de 5 rotas (grama manhã, dia e noite,
surf, varas) e os times de 5 treinadores (classe, nome, níveis, golpes, itens, flags de IA).
Sugestão: Route 29 (banco de encontro 1), Route 30, Route 31, Falkner e Bugsy. Amostra vista na
implementação, sem a conferência formal contra fonte de referência (que continua manual): a
Route 29 (Pidgey, Sentret e Rattata de dia; Hoothoot e Rattata à noite; taxa 25), Falkner (Pidgey
nível 9 e Pidgeotto nível 13) e Bugsy (Scyther 17, Kakuna 15 e Metapod 15).

## 6. Reexecução determinística (SC-004)

Rodar a etapa duas vezes (`--force events`) e comparar os hashes de `stages/events/events/`.
Esperado: idênticos. O teste da etapa já cobre a igualdade byte a byte.

## Resultado esperado

Os critérios SC-001 a SC-006 da spec são atendidos; qualquer falha aparece no relatório com o
script, o mapa e o motivo.
