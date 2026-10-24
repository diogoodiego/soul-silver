# Quickstart: validação de sprites

**Feature**: [spec.md](./spec.md) | **Plano**: [plan.md](./plan.md) | **Contrato**: [contracts/sprite-api.md](./contracts/sprite-api.md)

Roteiro para validar a feature de ponta a ponta. A ROM real nunca entra nos testes; os passos 3
a 5 usam a ROM do desenvolvedor apenas na conferência manual.

## Pré-requisitos

- Node.js 24 LTS e dependências instaladas (`npm install`).
- A ROM do SoulSilver (EUA) já extraída pela 003 e pelas etapas 004, 005 e 006.
- Verificação dos formatos (R0) concluída e registrada em [research.md](./research.md).

## 1. Testes automatizados

```bash
npm run test -w @soulsilver/shared
npm run test -w @soulsilver/extractor
```

Esperado: todos os testes de `sprites` passam com fixtures sintéticos
(`test/fixtures/sprites/`).

## 2. Typecheck e lint

```bash
npm run typecheck
npm run lint
```

Esperado: sem erros.

## 3. Extração e relatório (SC-001)

```bash
npm run extract
```

Esperado: a etapa `sprites` conclui; o relatório mostra os 493 Pokémon com sprites de overworld e
de batalha, normal e shiny, sem quadros faltando, e lista as substituições por forma base.

## 4. Pré-visualização (SC-003)

```bash
npm run sprites:view
```

Esperado: a página abre; escolher um sprite o anima em até 2 cliques; trocar para shiny muda só as
cores; ativar a âncora desenha o ponto do "pé". Sem extração prévia, a página mostra a mensagem
pedindo para rodar a extração.

## 5. Conferência visual de 20 Pokémon (SC-002)

Comparar com o jogo original, na página, 20 Pokémon que incluam ao menos 3 formas alternativas e 3
diferenças de gênero. Sugestão: espécies com forma (Unown, Deoxys, Wormadam, Shaymin, Giratina,
Rotom), com diferença de gênero (Pikachu, Meganium, Hippopotas, Unfezant, Pachirisu) e as
iniciais de Johto. Conferir cores, quadros e direção nas quatro direções do overworld.

## 6. Reexecução determinística (SC-004)

Rodar a extração duas vezes e comparar os hashes de `stages/sprites/sprites/`. Esperado:
idênticos.

## Resultado esperado

Os critérios SC-001 a SC-006 da spec são atendidos; qualquer falha aparece no relatório com o
sprite e o motivo.
