# Implementation Plan: IA de combate dos Pokémon

**Branch**: `019-combat-ai` | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/019-combat-ai/spec.md`

## Summary

A IA de selvagens do spec 15 (`stepAi` em `shared/wild/temperament.ts`, `drive` em
`server/src/wild.ts`) é substituída por um controlador genérico em `shared/ai`, em três camadas
puras: percepção (cone de visão com linha de visão na grade, audição, memória), decisão (máquina de
8 estados, tabela de ameaça com histerese, pontuação e sorteio ponderado de golpes) e ação
(distância preferida, mira com erro e antecipação, esquiva). O controlador só emite um `CombatInput`
(`move`, `buttons`, `aim`), o mesmo do jogador, e lê o combate por uma visão somente leitura
(`AiView`): o cooldown do adversário e posições nunca vistas não existem nela. O servidor monta o
`AiView`, roda os controladores escalonados e dormentes e entrega o input ao `combat.input`.
Perfis, temperamentos e a tabela perfil-por-nível vão para `content/ai/*.json` com schema zod.
A linha de visão é um módulo próprio (`shared/ai/sight.ts`) para os NPCs do spec de treinadores.
Depuração: mensagem `aiDebug` (protocolo 10 → 11) só quando o cliente liga a sobreposição, e log
de decisões em JSONL opcional no servidor. Sem dependências novas.

## Technical Context

**Language/Version**: TypeScript strict; Node.js do Electron (servidor em `utilityProcess`)

**Primary Dependencies**: zod (já usado). Nenhuma nova.

**Storage**: `content/ai/*.json` versionado no repo; log de decisões opcional em arquivo na pasta de dados do host (desligado por padrão)

**Testing**: vitest em Node puro (shared, server); sobreposição de depuração verificada à mão

**Target Platform**: Windows 10/11 64 bits

**Project Type**: desktop-app (Electron, monorepo)

**Performance Goals**: com 30 IAs ativas e 4 jogadores, custo da IA ≤ 2 ms por tick (orçamento de 50 ms);
percepção a 5 Hz e decisão a cada `decisionIntervalS` do perfil, com fase escalonada por entidade;
IAs a mais de `dormantTiles` de todo jogador não executam nada

**Constraints**: servidor autoritativo; nenhum número de comportamento fixo no código; o sorteio usa
o `Rng` do servidor (mesma ordem de chamadas na reprodução); fixtures sintéticas (princípio II)

**Scale/Scope**: até 4 jogadores; ~30 IAs ativas; 8 perfis iniciais; 8 estados

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Conformidade |
|-----------|--------------|
| I. Conteúdo fiel, mecânica livre | OK. Tipos, golpes e stats vêm dos dados extraídos; a IA é mecânica nova e entra em `docs/balance-log.md` (perfis, temperaturas, razão de dormência). Flags de IA dos treinadores ficam para o spec de treinadores. |
| II. Assets nunca distribuídos | OK. Só código e JSON escrito à mão; testes com fixtures sintéticas (Route 29 como ids e taxas, sem dados da ROM). |
| III. Data-driven | OK. Perfis, temperamentos, pesos de ameaça, pontuação e tabela de nível em `content/ai/*.json`, com schema validado no carregamento. |
| IV. Servidor autoritativo | OK. A IA roda só no servidor, em Node puro, sem Electron; o cliente desenha o "!" (já existe via `alert`) e a sobreposição. |
| V. Test-first | Aplicável (IA de selvagens). Cada módulo de `shared/ai` nasce com teste vermelho; ordem na tasks. |
| VI. Contratos versionados | Protocolo 10 → 11 (`aiDebug`, `debugAi` no cliente). Schemas em `shared/ai`. Sem mudança de save. |
| VII. Mundo compartilhado | OK. Selvagens são compartilhados; a ameaça lista todos os jogadores da área. |
| VIII, IX | Não afetados. |
| X. Desempenho e simplicidade | Orçamento acima, medido por teste de perf. Sem dependência nova. Complexidade extra: nenhuma fora do mínimo da spec. |
| XI. Entrega incremental | Marco jogável: selvagem agressivo que vê, avisa e luta (US1) antes de dificuldade, fuga e depuração. |

Resultado: sem violações; Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/019-combat-ai/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── ai-data.md
│   └── game-protocol-v11.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
content/ai/
├── profiles.json         # perfis de habilidade nomeados
├── temperaments.json     # transições e pesos por temperamento (substitui o uso do spec 15)
├── wild-levels.json      # faixa de nível → perfil
└── tuning.json           # ameaça, pontuação, dormência, escalonamento, ruído

packages/shared/src/ai/
├── schemas.ts            # zod dos 4 arquivos + AI_FORMAT_VERSION
├── sight.ts              # linha de visão e cone (reutilizável, sem dependência de combate)
├── perception.ts         # visão, audição, memória
├── threat.ts             # tabela de ameaça e histerese
├── scoring.ts            # pontuação e sorteio ponderado de golpes
├── action.ts             # distância preferida, mira, esquiva
├── controller.ts         # máquina de estados; emite CombatInput; ganchos de troca e item
├── view.ts               # AiView: o que a IA pode saber
└── index.ts

packages/server/src/
├── ai-loader.ts          # carrega e valida content/ai
├── ai.ts                 # monta AiView, escalona, dorme, aplica inputs, log de decisões
├── wild.ts               # troca drive/stepAi pelo controlador (mantém spawn e despawn)
└── combat.ts             # expõe leitura segura (AiView) e evento de ruído; sem regra nova

packages/shared/src/wild/temperament.ts   # removido (stepAi) quando o controlador cobrir os testes
packages/shared/src/game/protocol.ts      # aiDebug / debugAi (v11)
packages/client/src/render/ai-overlay.ts  # cone, última posição, raio da zona
packages/client/src/GameSession.svelte    # alterna a sobreposição junto do debug

packages/shared/test/ai/*.test.ts
packages/server/test/ai-*.test.ts         # cenários, 100 lutas, perf, reprodução
```

**Structure Decision**: o núcleo fica em `shared/ai` por ser função pura e reutilizável pelo spec
de treinadores (mesmo padrão de `shared/wild`); o servidor só liga a IA ao combate e ao tick. O
pacote `server` não ganha lógica de decisão.

## Complexity Tracking

Sem violações.
