# Quickstart: validar a IA de combate

Pré-requisitos: dependências instaladas (`npm install`), nada de ROM (os testes usam fixtures).

## 1. Testes de cenário e módulos (sem interface)

```text
npx vitest run packages/shared/test/ai
npx vitest run packages/server/test/ai-loader packages/server/test/ai-combat packages/server/test/wild
```

Esperado (spec, critérios de sucesso):

- Ember contra planta com perfil forte: Ember em mais de 90% de 1.000 decisões (SC-001, `scoring.test.ts`).
- Selvagem atrás de parede não percebe o jogador (SC-002, `perception.test.ts`, `controller.test.ts`).
- Passivo com HP baixo foge; territorial para ao sair do raio; puxado além do raio máximo volta (SC-003, SC-004, `controller.test.ts`).
- Zero golpes em cooldown e zero golpes sem `casting` prévio em 200 lutas (SC-005, `ai-combat.test.ts`).
- Alvo estável em grupo (SC-009, `threat.test.ts`).

## 2. 100 lutas simuladas

```text
npx vitest run packages/server/test/ai-route29
```

Esperado: o inicial no nível 5, controlado pelo bot de referência, vence ≥ 90 de 100 contra os
selvagens da Route 29 (SC-006). Resultado em 2026-10-25: 100 de 100, com o selvagem tirando de 4 a
20 HP do inicial por luta. Se falhar, ajuste `content/ai/profiles.json`, nunca o teste, e registre
em `docs/balance-log.md`.

## 3. Desempenho e reprodução

```text
npx vitest run packages/server/test/ai-perf packages/server/test/ai-replay packages/server/test/ai-debug
```

Esperado: 30 IAs ativas com 4 jogadores ficam abaixo de `performance.budgetMsPerTick` (2 ms) só de
IA (SC-007); duas reproduções da mesma gravação geram as mesmas decisões da sessão (SC-008); o
`aiDebug` só vai para quem pediu (FR-033).

## 4. Qualidade

```text
npm run typecheck
npm run lint
npm test
```

## 5. Verificação manual (sobreposição)

1. Rodar o app (skill `run-soulsilver`) e entrar na Route 29 com a equipe inicial.
2. F3 abre o painel de debug e liga a sobreposição de IA.
3. Conferir num selvagem agressivo: cone de visão, "!" ao notar, estado mudando para Aproximação e
   Combate, alvo, última posição lembrada ao quebrar a visão atrás de uma árvore, raio da zona e as
   pontuações dos golpes (SC-010).
4. Com `SOULSILVER_AI_LOG=<arquivo>` no ambiente do app, conferir o arquivo JSONL de decisões.
