# Quickstart: validação desta feature

**Feature**: [spec.md](./spec.md) | **Contratos**: [contracts/](./contracts/)

## Pré-requisitos

- Feature 003 concluída; `npm install` na raiz.
- Para os passos 2 a 5: o seu dump de Pokémon SoulSilver (EUA). Ele nunca entra no repositório.

## 1. Checagens automáticas

```text
npm run typecheck
npm run lint
npm test
```

Esperado: tudo verde. Cobertura sem ROM real:

| Critério | Onde |
|----------|------|
| Formatos de cada tabela, casos de borda | `packages/extractor/test/data/*.test.ts` |
| BLZ | `packages/extractor/test/data/blz.test.ts` |
| Schemas e mensagens (SC-004) | `packages/shared/test/game-data/*.test.ts` |
| Determinismo (SC-003) | `packages/extractor/test/data/determinism.test.ts` |
| Só a etapa alterada reextrai (SC-005) | `packages/extractor/test/data/stages-update.test.ts` |
| Relatório com dados sintéticos | `packages/extractor/test/data/report.test.ts` |

## 2. Extração com a ROM real

```text
npm run extract -- --rom <sua ROM> --out assets
```

Esperado: as sete etapas novas aparecem no plano (`missing`), terminam com código 0 e
`assets/stages/data-*/json/` contém os arquivos de [research R14](./research.md#r14-divisão-em-etapas).
Anote o tempo entre "Extraction started" e o fim das etapas novas no log (SC-006: no máximo 30 s).

## 3. Relatório de sanidade (SC-001)

```text
npm run extract -- --out assets --report
```

Esperado: código 0, todas as contagens com `ok`, nenhum arquivo `invalid`. Analise cada alerta:
um alerta legítimo do jogo original pode ficar (anote no PR); qualquer outro indica erro de
leitura.

## 4. Determinismo (SC-003)

```text
npm run extract -- --rom <sua ROM> --out assets --force code-decompress
```

Esperado: as etapas de dados rodam de novo (`dependency-rerun` ou `forced`) e
`assets/manifest.json` mantém os mesmos `sha256` de antes para todas as saídas `json`. Compare os
digests antes e depois.

## 5. Amostra manual (SC-002)

Confira, contra fontes de referência públicas (Bulbapedia, Serebii), todos os campos de:

- **Pokémon**: 6 Charizard, 25 Pikachu, 81 Magnemite (sem gênero), 133 Eevee (evoluções), 201
  Unown, 249 Lugia, 386 Deoxys e a forma 496 (Ataque), 413 Wormadam e a forma 500 (Lixo), 479
  Rotom e a forma 503 (Calor), 493 Arceus.
- **Golpes**: 1 Pound, 14 Swords Dance (status), 53 Flamethrower, 89 Earthquake, 129 Swift
  (sem checagem de precisão), 67 Low Kick (poder variável), 237 Hidden Power, 98 Quick Attack
  (prioridade), 182 Protect, 467 Shadow Force.

Use `assets/stages/data-species/json/species.json`, `.../data-learnsets/json/learnsets.json` e
`.../data-moves/json/moves.json`. Registre no PR a tabela "campo × valor × referência".

## 6. Atualização no app

1. Com os assets da 003 prontos, rode `npm run dev`.
2. Esperado: "Atualizando os arquivos do jogo", só as sete etapas novas, sem pedir a ROM, e
   depois a tela principal.
