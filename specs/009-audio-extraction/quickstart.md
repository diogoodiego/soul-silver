# Quickstart: validação de áudio

**Feature**: [spec.md](./spec.md) | **Plano**: [plan.md](./plan.md) | **Contrato**: [contracts/audio-api.md](./contracts/audio-api.md)

Roteiro para validar a feature de ponta a ponta. A ROM real nunca entra nos testes; os passos 3 a 6
usam a ROM do desenvolvedor apenas na conferência manual.

## Pré-requisitos

- Node.js 24 LTS e dependências instaladas (`npm install`).
- A ROM do SoulSilver (EUA) já extraída pela 003 e pelas etapas 004, 005, 006 e 008.
- Verificação do arquivo de som (R0) concluída e registrada em [research.md](./research.md).
- Caixas de som ou fones, e o jogo original (ou um emulador) para a comparação lado a lado.

## 1. Testes automatizados

```bash
npm run test -w @soulsilver/shared
npm run test -w @soulsilver/extractor
```

Esperado: todos os testes de `audio` passam com fixtures sintéticos (`test/fixtures/audio/`).

## 2. Typecheck e lint

```bash
npm run typecheck
npm run lint
```

Esperado: sem erros.

## 3. Extração e relatório (SC-003, SC-004)

```bash
npm run extract -- --rom "<ROM>.nds" --stages audio
npm run extract -- --report
```

Esperado: a etapa `audio` conclui em menos de 10 minutos; a seção "Áudio" mostra as contagens de
músicas, jingles, efeitos e cries, os 493 cries presentes, o tamanho total abaixo de 1 GB e a lista
de ids de mapa e script sem faixa (idealmente vazia). O relatório completo está em
`assets/stages/audio/audio/report.json`.

## 4. Reprodutor de desenvolvimento (SC-008)

```bash
npm run audio:view
```

Esperado: a página abre e lista as faixas por tipo; escolher uma faixa a toca em até 2 cliques; uma
faixa com loop mostra o loop marcado e repete depois da introdução. Sem extração prévia, a página
mostra a mensagem pedindo para rodar a extração.

## 5. Comparação lado a lado (SC-001)

Tocar na página e no jogo original, em sequência, as faixas de New Bark Town, Route 29, batalha
selvagem e Centro Pokémon. Os ids saem de `musicDay` e `musicNight` do cabeçalho do mapa
(`assets/stages/maps/maps/map-headers.json`) e dos scripts. Esperado: reconhecivelmente iguais em
melodia, tempo, instrumentos e dinâmica nas 4.

## 6. Loop sem corte (SC-002) e cries (SC-003)

Deixar 10 faixas com loop tocando por pelo menos 3 voltas cada (sugestão: as 4 acima, mais cidades,
rotas e a batalha de treinador). Esperado: nenhum corte, estalo ou silêncio na volta. Conferir no
relatório que os 493 cries estão presentes e ouvir uma amostra (inicial de cada região, Pikachu,
um Pokémon com forma).

## 7. Reexecução determinística (SC-005)

Rodar a etapa duas vezes (`--force audio`) e comparar os hashes de `stages/audio/audio/`. Esperado:
idênticos.

## Resultado esperado

Os critérios SC-001 a SC-008 da spec são atendidos; qualquer falha aparece no relatório com a faixa
e o motivo.
