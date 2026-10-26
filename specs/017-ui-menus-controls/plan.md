# Implementation Plan: Interface básica, menu inicial e controles

**Branch**: `017-ui-menus-controls` | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/017-ui-menus-controls/spec.md`

## Summary

O `App.svelte` vira uma máquina de telas simples: primeiro uso/extração (spec 3) → título → menu
principal → Jogar (save → modo → partida) → jogo. O `MainMenu.svelte` provisório do spec 12 é
dividido nessas telas e reaproveita `SaveSlots`, `NewGame`, `JoinGame` e `FirewallNotice` e as
mesmas chamadas de IPC. Um novo estágio do extrator grava a arte da tela de título. A entrada
(`input/input.ts`) passa a ler um mapa ação → tecla/botão vindo das configurações e ganha ações de
menu (cima, baixo, confirmar, cancelar, abas). Um gerenciador de foco leva o gamepad e o teclado a
qualquer botão das telas Svelte. No jogo entram a caixa de diálogo, o HUD de combate (substitui o
`ArenaHud`), a equipe, a mochila e a Pokédex. Os menus não pausam nada: o cliente avisa o servidor,
que marca a entidade como ocupada e recusa menus durante combate. O protocolo vai de 8 para 9
(menu aberto, reordenar equipe, usar item). O save não muda; as configurações por PC crescem.
Os textos da interface passam por um dicionário de i18n.

## Technical Context

**Language/Version**: TypeScript strict; Svelte 5 (runes); Node.js do Electron

**Primary Dependencies**: Svelte 5, three.js, zod (já usados). Nenhuma nova.

**Storage**: `settings.json` por PC (ampliado, com defaults para arquivos antigos); save v4 sem mudança

**Testing**: vitest (shared, server, client/input); telas Svelte verificadas à mão pelo quickstart (princípio V isenta UI)

**Target Platform**: Windows 10/11 64 bits

**Project Type**: desktop-app (Electron, monorepo)

**Performance Goals**: HUD atualizado no ritmo do estado (20 Hz) sem queda de quadros; navegação de menu responde no mesmo quadro

**Constraints**: servidor autoritativo; menus nunca pausam a simulação; arte de título só vinda da ROM do usuário (princípio II); HUD legível de 1280×720 a 1920×1080

**Scale/Scope**: ~12 telas/componentes Svelte; 3 slots; 4 jogadores

## Constitution Check

| Princípio | Status | Nota |
|-----------|--------|------|
| I Conteúdo fiel, mecânica livre | ✅ | Arte de título, bolsos, entradas da Pokédex e textos vêm da ROM. "Menus não pausam" e "ocupado" são mecânica nova e vão para `docs/balance-log.md`. |
| II Assets nunca distribuídos | ✅ | A arte de título é um estágio do extrator, gerada na máquina do jogador. |
| III Data-driven | ✅ | Bolsos, itens, nomes e entradas vêm de `game-data` e do catálogo; cura da Potion vem dos dados do item. |
| IV Servidor autoritativo | ✅ | Reordenar, usar item e estado ocupado são pedidos validados no servidor. |
| V Test-first | ✅ | Mapa de controles, conflito de teclas, navegação de foco, validação das mensagens novas, uso de item e reordenação com teste antes. Telas Svelte isentas, verificadas no quickstart. |
| VI Contratos versionados | ✅ | `PROTOCOL_VERSION` 8 → 9; IPC `getSettings`/`setSettings` ampliado em `shared`. |
| VII Progresso individual | ✅ | Menus e itens são do jogador; os outros só veem "ocupado". |
| VIII Saves do jogador | ✅ | Configurações ficam no PC; nada novo no save. |
| IX Segurança do Electron | ✅ | Janela e tela cheia só por IPC tipado; nenhum acesso Node no renderer. |
| X Simplicidade | ✅ | Sem biblioteca de i18n nem de UI; dicionário e gerenciador de foco próprios, pequenos. |

Sem violações. Re-checado após Phase 1: sem mudanças.

## Project Structure

### Documentation (this feature)

```text
specs/017-ui-menus-controls/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── game-protocol-v9.md
│   ├── settings-ipc.md
│   └── ui-actions.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
packages/extractor/src/title/        # NOVO: estágio que grava a arte de título (PNG) em stages/title/
packages/shared/src/
├── ipc.ts                           # AppSettings ampliado; setSettings
├── save/schema.ts                   # SlotSummary ganha badges
├── game/protocol.ts                 # mensagens menu, reorder-party, use-item; entidade data.busy
├── protocol-version.ts              # 9
└── input/bindings.ts                # NOVO: ações, padrões teclado/Xbox, troca em conflito (puro)
packages/server/src/
├── session.ts (ou equivalente)      # trata menu / reorder-party / use-item
└── items.ts                         # NOVO: Potion (cura do dado do item), recusa demais itens
packages/app/src/main/
├── settings.ts                      # novos campos com defaults
├── window-options.ts / index.ts     # aplica tamanho e tela cheia
└── save-store.ts                    # badges no resumo
packages/client/src/
├── App.svelte                       # máquina de telas
├── i18n/{index.ts,pt-BR.ts}            # NOVO: t(key, vars)
├── input/input.ts                   # lê bindings, expõe ações de menu e dispositivo ativo
├── input/focus.ts                   # NOVO: navegação por foco com gamepad/teclado
├── screens/                         # NOVO: Title, Home, About, Play (save→modo→partida), Settings, Controls
├── game/                            # NOVO: CombatHud, PartyMenu, Bag, Pokedex, DialogBox, PauseMenu
└── MainMenu.svelte, ArenaHud.svelte # removidos (lógica migra para screens/Play e game/CombatHud)
```

**Structure Decision**: segue o monorepo atual; lógica pura nova em `shared` (bindings) e `server`
(itens), telas no `client` agrupadas em `screens/` (fora do jogo) e `game/` (sobre o jogo).

## Complexity Tracking

Nenhuma violação a justificar.
