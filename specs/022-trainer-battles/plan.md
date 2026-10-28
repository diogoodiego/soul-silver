# Implementation Plan: Batalhas contra treinadores

**Branch**: `022-trainer-battles` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/022-trainer-battles/spec.md`

## Summary

Treinadores passam a perceber o jogador com `shared/ai/sight.ts` (spec 019), usando o alcance de
visão do objeto de evento (`param[0]`, `eyeRange` no original) e a direção do NPC. Um avistamento
inicia o mesmo fluxo que o comando de script `TrainerBattle` (hoje só ponteado em `BRIDGED`):
"!" (mensagem `alert` existente), trava, caminhada até o jogador, fala de desafio, arena.
O servidor ganha `server/src/trainer-battle.ts`: uma batalha por jogador, com arena centrada no
encontro (raio em `content/trainer/tuning.json`), lançamento do time na ordem original, filtro de
dano por batalha (só os participantes se atingem) e fim de batalha (fala de derrota, prêmio, XP,
flag de treinador derrotado; derrota usa o `blackout` de `companion.ts`). A IA de treinador
preenche os hooks vazios `AiHooks.chooseSwitch` / `chooseItem` com funções puras em
`shared/trainer/`, dirigidas por um perfil derivado das flags de IA (`content/trainer/ai-flags.json`)
ou pelo padrão da classe (`content/trainer/class-profiles.json`). Poké Ball e fuga são bloqueadas
quando o alvo pertence a uma batalha de treinador. Música por classe no `cues.json`. Protocolo
14 → 15 (`trainerBattle` start/end, arena). Save sem mudança de formato: o "derrotado" usa as
flags de treinador do original (já salvas por jogador). Sem dependências novas.

## Technical Context

**Language/Version**: TypeScript strict; Node.js do Electron (servidor em `utilityProcess`)

**Primary Dependencies**: zod (já usado). Nenhuma nova.

**Storage**: `content/trainer/*.json` escrito à mão (perfis, mapeamento de flags, tuning); dados de treinador, classe, prêmio e música vêm do extrator na pasta de dados do usuário; flags de derrota no save existente

**Testing**: vitest em Node puro (shared, server, extractor); "!", arena e HUD verificados à mão

**Target Platform**: Windows 10/11 64 bits

**Project Type**: desktop-app (Electron, monorepo)

**Performance Goals**: verificação de visão só para treinadores não derrotados num raio de ativação do jogador, a 5 Hz (mesma cadência da percepção da IA); custo ≤ 0,5 ms por tick com 4 jogadores e 4 batalhas simultâneas

**Constraints**: servidor autoritativo; estado do treinador por jogador (princípio VII); números de troca, item e arena em dados; fixtures sintéticas

**Scale/Scope**: ~40 treinadores da Route 29 à Sprout Tower e Ginásio de Violet; até 4 batalhas simultâneas; batalhas simples e duplas

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Conformidade |
|-----------|--------------|
| I. Conteúdo fiel, mecânica livre | OK. Times, itens, flags de IA, classes, prêmio e música vêm da ROM; fórmula de prêmio original. Perfis de IA, limiares e raio da arena entram em `docs/balance-log.md`. |
| II. Assets nunca distribuídos | OK. `content/trainer/*.json` só tem mapeamentos escritos à mão (ids de bits e de classe, nenhum texto da ROM); testes com treinadores sintéticos. |
| III. Data-driven | OK. Mapeamento flags→perfil, perfis por classe, limiares e raio em JSON com schema zod validado no carregamento. |
| IV. Servidor autoritativo | OK. Visão, batalha, IA, prêmio e flags só no servidor; cliente desenha "!", arena e falas. |
| V. Test-first | Aplicável (combate, IA, scripts, servidor, protocolo, extrator). Testes vermelhos primeiro, ordem na tasks. |
| VI. Contratos versionados | Protocolo 14 → 15. Schemas novos em `shared/trainer`. Save sem mudança (`SAVE_SCHEMA_VERSION` fica 6). |
| VII. Progresso individual | OK. Derrota é flag por jogador; o mesmo NPC pode lutar com dois jogadores; treinadores derrotados não desafiam aquele jogador. |
| VIII, IX | Não afetados. |
| X. Desempenho e simplicidade | Reusa sight, controlador, combat, blackout, alert e bridge. Sem dependência nova. |
| XI. Entrega incremental | Marco 1: treinador de um Pokémon avista e luta (US1+US2 mínimo); depois troca/itens, recompensas, duplas, multiplayer. |

**Pós-design**: sem violações; nenhuma justificativa de complexidade necessária.

## Project Structure

### Documentation (this feature)

```text
specs/022-trainer-battles/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── protocol-v15.md
│   └── content-trainer.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/
├── trainer/
│   ├── schemas.ts        # ai-flags, class-profiles, tuning (zod)
│   ├── profile.ts        # flags/classe -> TrainerProfile
│   ├── decide.ts         # chooseSwitch / chooseItem puros
│   ├── prize.ts          # fórmula de prêmio original
│   └── index.ts
├── events/schemas.ts     # classe ganha prizeBase e music (extrator)
├── game/protocol.ts      # mensagens trainerBattle (v15)
└── protocol-version.ts   # 15

packages/server/src/
├── trainer-battle.ts     # visão, aproximação, arena, ciclo de vida, fim
├── scripts.ts            # bridge TrainerBattle -> trainer-battle
├── capture.ts / items.ts # bloqueio de bola e fuga
├── combat.ts             # filtro de alvo por batalha
├── companion.ts          # raio vindo da arena
└── ai.ts                 # injeta AiHooks de treinador

packages/extractor/src/   # tabela de classes: prêmio base e música
packages/client/src/      # arena, falas, música por classe (verificação manual)
content/trainer/          # ai-flags.json, class-profiles.json, tuning.json
content/audio/cues.json   # trainerBattle, rivalBattle, leaderBattle
```

**Structure Decision**: segue o monorepo existente; lógica pura em `shared/trainer`, orquestração em um módulo de servidor, como `wild.ts`/`companion.ts`.

## Complexity Tracking

Nenhuma violação a justificar.
