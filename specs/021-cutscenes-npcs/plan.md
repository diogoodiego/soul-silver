# Implementation Plan: Cutscenes e NPCs

**Branch**: `021-cutscenes-npcs` | **Date**: 2026-10-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/021-cutscenes-npcs/spec.md`

## Summary

Hoje os NPCs são entidades estáticas criadas por `server/src/scripts.ts` a partir de `map-events` (cada um com `movement`, `facing`, `xRange`, `yRange`, `param`), e os comandos `ApplyMovement`/`WaitMovement` são apenas "ligações" (`BRIDGED`) que o interpretador (spec 020) não executa. Plano:

- **`shared/npc`** (puro, Node): tabela `movement → padrão` (parado, olhando, vagando, caminho fixo) e uma máquina de passos determinística por NPC, com RNG semeado (`createRng`). Testável sem servidor.
- **Servidor** (`server/src/npcs.ts`): avança os NPCs no tick de 20 Hz, respeitando `CollisionMap`, outros NPCs e jogadores. Posição de NPC é cosmética e compartilhada, mas nunca decide progresso.
- **Cutscene = o servidor mantém o script, o cliente do jogador encena** (mesma divisão da spec 020). `ApplyMovement`/`WaitMovement` e os comandos de câmera viram um pedido `cutscene` enviado só ao cliente de quem disparou; o cliente anima atores e câmera e responde quando termina. O servidor marca o jogador `busy` e replica isso aos outros.
- **Atores locais**: durante a cutscene o servidor deixa de enviar ao jogador a posição compartilhada dos NPCs envolvidos; o cliente os controla sozinho, então nada vaza para os outros.
- **Posição permanente por jogador**: comandos de reposicionamento gravam em `npcPlacement` do save; o filtro de replicação aplica o override por jogador (um NPC que saiu do caminho para A continua bloqueando B).
- **Segurança**: `busy` torna o jogador inatingível e não interativo; o servidor zera a ameaça de selvagens contra ele.
- **Introdução**: após a criação do save, o servidor dispara o script de introdução com nome/personagem do save.
- **Texto acelerado**: opção que reutiliza a velocidade de texto das Configurações.
- **Protocolo 13 → 14**, **save v5 → v6** (migração testada). Sem dependências novas.

## Technical Context

**Language/Version**: TypeScript strict; Node.js do Electron (servidor em `utilityProcess`); three.js + Svelte no cliente

**Primary Dependencies**: zod (já usado). Nenhuma nova.

**Storage**: save do jogador (`npcPlacement`); dados da extração lidos do disco (nunca commitados)

**Testing**: vitest em Node puro para `shared/npc`, servidor (isolamento entre jogadores, busy, selvagens) e protocolo; encenação no cliente e comparação lado a lado verificadas à mão (princípio V)

**Target Platform**: Windows 10/11 64 bits

**Project Type**: desktop-app (Electron, monorepo)

**Performance Goals**: NPCs de um mapa + 4 jogadores ≤ 1 ms por tick; 60 fps no cliente com cutscene

**Constraints**: servidor autoritativo; cutscene de um jogador nunca altera a replicação dos outros; comando de movimento/câmera desconhecido encerra o script com segurança (já coberto por `MissingCommand`)

**Scale/Scope**: dezenas de NPCs por mapa; cutscenes da introdução, laboratório do Elm, rival e ovo do Mr. Pokémon

## Constitution Check

| Princípio | Conformidade |
|-----------|--------------|
| I. Conteúdo fiel | OK. Movimentos, passos e câmera vêm dos dados extraídos; critério lado a lado. |
| II. Assets nunca distribuídos | OK. Testes com fixtures sintéticas. |
| III. Data-driven | OK. Tabela de tipos de movimento é semântica (código); parâmetros e passos são dados. |
| IV. Servidor autoritativo | OK. Servidor mantém script, `busy`, colisão e NPCs; cliente só encena. |
| V. Test-first | Aplicável à lógica de NPC, `busy`, filtro por jogador e save; cliente isento, verificado à mão. |
| VI. Contratos versionados | Protocolo 13 → 14; save 5 → 6 com migração. |
| VII. Progresso individual | OK. Cutscene encenada no cliente de quem disparou; outros veem "ocupado"; posições permanentes por jogador. |
| VIII. Saves | OK. `npcPlacement` no save, mesma gravação atômica. |
| IX. Segurança do Electron | OK. Sem novos canais de IPC. |
| X. Simplicidade | OK. Sem dependência nova; um tipo de pedido `cutscene` com união de passos. |

Re-avaliado após o design: sem violações. Tabela de complexidade não necessária.

## Project Structure

### Documentation (this feature)

```text
specs/021-cutscenes-npcs/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── protocol-v14.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/
├── npc/                 # tabela de padrões e máquina de passos (novo)
├── script/handlers/     # bridge.ts: ApplyMovement/WaitMovement/câmera deixam de ser só ligação
├── game/protocol.ts     # mensagens v14
└── save/                # schema v6 + migração (npcPlacement)
packages/server/src/
├── npcs.ts              # tick dos NPCs e colisão (novo)
├── scripts.ts           # pedidos cutscene, busy, placement, filtro por jogador
├── ai.ts / combat.ts    # selvagens desistem; busy inatingível
packages/client/src/
├── render/              # atores locais, câmera de cutscene (travar, mover, tremer)
└── GameSession.svelte   # estado ocupado, opção de texto acelerado
packages/*/test/         # testes de cada parte
```

**Structure Decision**: segue o layout do monorepo; lógica pura em `shared`, simulação em `server`, encenação em `client`.

## Complexity Tracking

Sem violações a justificar.
