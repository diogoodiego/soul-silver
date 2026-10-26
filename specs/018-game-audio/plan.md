# Implementation Plan: Áudio no jogo

**Branch**: `018-game-audio` | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/018-game-audio/spec.md`

## Summary

O cliente toca os WAV extraídos pela feature 009 (`assets://stages/audio/...`) com a Web Audio API
do Chromium, decodificados por `decodeWav` (já em `shared/audio`) e tocados como `AudioBuffer` com
`loopStart`/`loopEnd` vindos do `audio-index`. A música é um diretor puro (`shared/audio/director.ts`)
que, a partir do estado local (título, mapa e período, em combate, vitória), diz qual faixa deve
tocar. O cliente só faz o crossfade entre dois `GainNode`. Os efeitos saem de eventos que o cliente
já recebe (`combat-event`, `capture`, `exp-gain`, `progression`, `fainted`, entidades novas de golpe,
warps, menus) e passam por um mixer puro (`shared/audio/mixer.ts`) que calcula volume, pan e
prioridade e aplica o limite de vozes. Quais faixas tocam em cada momento é conteúdo em
`content/audio/cues.json` (princípio III). O único dado novo do servidor é `alert: true` nos dados
da entidade selvagem que começou a perseguir, para o cry de "me notou" (protocolo 9 → 10). Os
volumes entram em `AppSettings` (spec 017), sem mudança no save.

## Technical Context

**Language/Version**: TypeScript strict; renderer Chromium do Electron

**Primary Dependencies**: Web Audio API (plataforma), zod, Svelte 5 (já usados). Nenhuma nova.

**Storage**: `settings.json` do app ganha o campo `audio`; save não muda

**Testing**: vitest em Node puro para diretor, mixer, cues e settings; escuta manual com a ROM real

**Target Platform**: Windows 10/11 64 bits

**Project Type**: desktop-app (Electron, monorepo)

**Performance Goals**: 60 fps com 4 jogadores em combate; nenhum decode no quadro (decode no carregamento da área); servidor sem custo novo além de uma flag

**Constraints**: áudio só no cliente (princípio IV); nenhum áudio no repositório (princípio II); testes sem ROM

**Scale/Scope**: até 4 jogadores; limite de 16 vozes de efeito; cache de áudio por área

## Constitution Check

| Princípio | Status | Nota |
|-----------|--------|------|
| I Conteúdo fiel, mecânica livre | ✅ | Músicas, efeitos e cries são os da ROM, com os loops originais. Atenuação, pan e limite de vozes são apresentação nova, registrada em `docs/balance-log.md`. |
| II Assets nunca distribuídos | ✅ | O áudio vem da extração em runtime pelo `assets://`; `cues.json` guarda só nomes e ids de faixas. |
| III Data-driven | ✅ | Faixa de cada momento, sons de golpe e de arquétipo, duração do crossfade, alcance e limite de vozes ficam em `content/audio/cues.json`, validado por schema. |
| IV Servidor autoritativo | ✅ | Áudio só no cliente, a partir de mensagens já existentes; o servidor só expõe `alert`. |
| V Test-first | ✅ | Diretor de música, mixer (atenuação, pan, prioridade, limite), resolução de cues e settings com teste antes. |
| VI Contratos versionados | ✅ | `PROTOCOL_VERSION` 9 → 10 (`alert`); `cues.json` com schema e `formatVersion`; settings com campo novo e default. |
| VII Progresso individual | ✅ | Cada cliente toca pelo próprio estado. |
| VIII Saves do jogador | ✅ | Volumes ficam nas configurações do PC, não no save. |
| X Desempenho e simplicidade | ✅ | API da plataforma, dois módulos puros, nenhuma dependência nova. |

Sem violações. Re-checado após Phase 1: sem mudanças.

## Project Structure

### Documentation (this feature)

```text
specs/018-game-audio/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── audio-cues.md
│   └── game-protocol-v10.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
content/audio/cues.json            # NOVO: faixa por momento, sons de golpe/arquétipo, parâmetros de mixagem

packages/shared/src/audio/
├── cues.ts                        # NOVO: schema de cues.json e resolução (golpe → som, fallback do arquétipo)
├── director.ts                    # NOVO: estado local → faixa de música desejada
├── mixer.ts                       # NOVO: volume/pan por distância, prioridade, limite de vozes
└── index.ts
packages/shared/src/settings.ts    # campo audio (master, music, effects, muteUnfocused)
packages/shared/src/protocol-version.ts   # 10

packages/server/src/wild.ts        # data.alert = true ao entrar em "chase"

packages/client/src/audio/         # NOVO
├── engine.ts                      # AudioContext, buses, crossfade, loop, vozes
├── loader.ts                      # audio-index, decode e cache por área
└── reactions.ts                   # mensagens do servidor e da UI → cues
packages/client/src/screens/Settings.svelte   # seção Áudio
packages/client/src/input/menu.ts             # sons de cursor/confirmar/cancelar
packages/client/src/GameSession.svelte        # liga reactions ao jogo

packages/shared/test/audio/{director,mixer,cues}.test.ts
packages/shared/test/settings.test.ts
docs/balance-log.md
```

**Structure Decision**: segue o monorepo; nenhum pacote novo. Lógica pura em `shared/audio`, ao lado
do decodificador da 009, e a parte que depende do navegador em `client/src/audio`.

## Complexity Tracking

Nenhuma violação a justificar.
