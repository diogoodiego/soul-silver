# Implementation Plan: Campanha jogável até a Insígnia Zephyr

**Branch**: `024-playable-campaign-zephyr` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/024-playable-campaign-zephyr/spec.md`

## Summary

A história não anda porque o jogo novo não nasce como o original. O plano corrige a origem:

1. **Estado inicial vindo da ROM.** Como no original (`NewGame_InitSaveData` + `RunInitScript`, [research.md](research.md) R1): o estágio `events` (versão 5) lê do ARM9 `sLocation_PlayerRoom` (mapa 64, tile 6,6, sul) e grava `new-game.json`; ao criar o save, o servidor roda uma vez o script já extraído 9600 (`_std_init`, arquivo 149), que liga as ~140 flags `FLAG_HIDE_*`. O servidor deixa de usar `start.ts` (heurística de portas).
2. **Inicial pelo script.** A criação do save pede só nome e personagem; `starter.ts` e o parâmetro `starter` de `save-store.create` saem. O script do Prof. Elm entrega o Pokémon (comandos de Pokémon já existentes) e liga a flag de marco.
3. **Rival.** Save ganha `rivalName`; `NameRival` abre a entrada de texto existente (a do nome do jogador) e `BufferRivalsName` o usa no buffer de mensagens.
4. **Comandos restantes.** `MsgBoxExtern` (banco do catálogo de texto existente), `GetStdMsgNaix` (tabela de 4 bancos lida do overlay 1 no estágio `events`), `TempBGM`, `ScrCmd_729` (companion ativo → var), mais `LotoIDSet` do script 9600. Comportamento de cada um em research R3. Meta: log de faltantes vazio no trecho.
5. **Saves antigos.** Schema 7 → 8: `rivalName` e `storyRev`. Saves com `storyRev` ausente viram `storyRev: 0` ("história desatualizada"); o cliente oferece recomeçar a história no slot (preserva nome, personagem e tempo; zera flags, vars, time, bolsa, dex e posição) ou continuar.
6. **Depurador.** O depurador de scripts (spec 020) ganha três painéis: objetos do mapa com flag de esconder e visibilidade, scripts de mapa/gatilhos com condição e estado, histórico de flags/vars com o script autor. Protocolo 16 → 17.
7. **Caminho dourado.** Um teste local (`pnpm golden`, fora da CI) usa a ROM real, o servidor em Node puro e um cliente scriptado (inputs + teleportes de desenvolvimento) para percorrer os 10 marcos, conferindo flags/vars e duplicados por marco, com relatório de falha.

## Technical Context

**Language/Version**: TypeScript strict; Node.js do Electron

**Primary Dependencies**: zod (já usado). Nenhuma nova.

**Storage**: `new-game.json` e `std-messages.json` novos na pasta de dados (estágio `events`); save v8 (JSON, gravação atômica existente)

**Testing**: vitest em Node puro com fixtures sintéticas (extrator, shared, server, app/save-store, protocolo); caminho dourado local com a ROM real (`packages/server/golden/`, excluído da CI por não casar com `*.test.ts` e por exigir `SOULSILVER_ROM`)

**Target Platform**: Windows 10/11 64 bits

**Project Type**: desktop-app (Electron, monorepo)

**Performance Goals**: sem regressão do tick de 20 Hz; histórico de flags é um anel de 64 entradas; painéis do depurador só enviados com o depurador ligado

**Constraints**: servidor autoritativo; nada da ROM no repositório; fixtures sintéticas; estado por jogador (princípio VII)

**Scale/Scope**: trecho New Bark → Falkner (~20 mapas, ~10 marcos); 6 comandos de script; 1 estágio de extrator; 1 migração de save

## Constitution Check

| Princípio | Conformidade |
|-----------|--------------|
| I. Conteúdo fiel | OK. Posição e flags iniciais vêm da ROM, não de heurística. Sem desvio de balanceamento (nada a logar em `balance-log.md`). |
| II. Assets nunca distribuídos | OK. `new-game.json` e mensagens externas ficam na pasta de dados do usuário. O caminho dourado lê a ROM do desenvolvedor por variável de ambiente e nunca entra na CI. Fixtures sintéticas nos testes comuns. |
| III. Data-driven | OK. Estado inicial é arquivo com schema zod validado no carregamento. Marcos do caminho dourado ficam em dados do próprio teste (ids de flag/var), não no servidor. |
| IV. Servidor autoritativo | OK. Estado inicial, `NameRival` e histórico vivem no servidor; o cliente só mostra a entrada de texto e os painéis. |
| V. Test-first | Aplicável (extrator, migração, comandos, protocolo, servidor). Testes vermelhos primeiro, ordem em tasks. Caminho dourado local cumpre a exigência de verificação com dados reais; o spec só fecha com ele passando. |
| VI. Contratos versionados | Save 7 → 8 com migração testada; protocolo 16 → 17; schemas em `shared`. |
| VII. Progresso individual | OK. Flags, vars, nome do rival e `storyRev` são por jogador; visibilidade já filtrada por flags do jogador. |
| VIII. Saves locais | OK. Recomeço de história usa a gravação atômica com backup existente. |
| IX. Segurança do Electron | Não afetado (canal IPC de recomeço, se necessário, tipado no preload). |
| X. Desempenho e simplicidade | Reusa interpretador, entrada de texto, depurador e filtro de visibilidade. Sem dependência nova. |
| XI. Entrega incremental | Marco: US1–US3 (jogo anda até o laboratório) → comandos/rival → diagnóstico → caminho dourado completo. |

Reavaliação pós-design: sem violações; nenhuma entrada em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/024-playable-campaign-zephyr/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── new-game-data.md
│   ├── save-v8.md
│   ├── protocol-v17.md
│   └── golden-path.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/extractor/src/events/
├── new-game.ts          # NOVO: lê sLocation_PlayerRoom do ARM9 (R1), chamado pelo estágio events
├── std-messages.ts      # NOVO: lê a tabela de GetStdMsgNaix do overlay 1 (R3)
└── stage.ts             # versão 4 → 5, grava new-game.json e std-messages.json
packages/shared/src/
├── events/schemas.ts    # schemas de new-game.json e std-messages.json (codec dos eventos)
├── save/                # schema v8, migração 7→8, applyNewGame (new-game.ts), restartStory()
├── script/handlers/     # NameRival/BufferRivalsName (message.ts), MsgBoxExtern/GetStdMsgNaix, TempBGM, ScrCmd_729
└── game/protocol.ts     # v17: painéis do depurador, textPrompt de rival, aviso de história desatualizada
packages/server/src/
├── start.ts             # removido: posição vem de new-game.json
├── scripts.ts           # histórico de flags/vars, painéis do depurador
└── session.ts           # aplica estado inicial; rivalName
packages/app/src/main/
├── save-store.ts        # create sem starter; restartStory
└── starter.ts           # removido
packages/client/src/
├── NewGame.svelte       # só nome e personagem
├── game/ScriptDebug.svelte  # 3 painéis novos
└── (aviso "história desatualizada" na seleção de slot)
packages/server/golden/  # NOVO: caminho dourado local (ROM real)
```

**Structure Decision**: segue o monorepo existente. Um estágio de extrator por origem de dado; schemas em `shared`; o caminho dourado vive em `server/golden` para reusar o harness do servidor, fora do glob de testes da CI.

## Complexity Tracking

Sem violações.
