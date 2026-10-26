# Data Model: Áudio no jogo

**Feature**: [spec.md](spec.md) | **Pesquisa**: [research.md](research.md)

## Cues (`content/audio/cues.json`)

Ver [contracts/audio-cues.md](contracts/audio-cues.md). Liga cada momento do jogo a uma faixa do
`audio-index` (009) pelo nome, e guarda os parâmetros de mixagem.

| Campo | Tipo | Regra |
|-------|------|-------|
| `music.title`, `music.wildBattle`, `music.victory` | nome de faixa | do tipo `music`; `victory` toca uma volta só (até o fim do loop) |
| `effects.<cue>` | nome de faixa | uma entrada para cada `EffectCue` |
| `archetypes.<id do arquétipo>` | nome de faixa | opcional por arquétipo |
| `defaultMove` | nome de faixa | obrigatório |
| `mix.crossfadeMs` | inteiro 0–5000 | padrão 800 |
| `mix.rangeTiles` | inteiro 1–64 | padrão 12 |
| `mix.maxVoices` | inteiro 4–64 | padrão 16 |
| `mix.faintCryRate` | número 0,5–1 | padrão 0,85 |

Um nome que não existe no `audio-index` não é erro de carga: o som é ignorado e logado (FR-021).

`EffectCue` = `hit` · `hit-super` · `hit-weak` · `faint` · `ball-throw` · `ball-shake` ·
`ball-catch` · `ball-escape` · `door` · `warp` · `level-up` · `evolution` · `menu-cursor` ·
`menu-confirm` · `menu-cancel`.

## Estado de música (cliente)

| Campo | Origem |
|-------|--------|
| `screen` | `"title"` na tela de título, `"game"` na sessão |
| `musicDay`, `musicNight` | header do mapa atual (006) |
| `night` | período ao entrar no mapa (`timeOfDay`, shared/companion) |
| `inCombat` | `view.self.kind === "pokemon"` (já em GameSession) |
| `victory` | `true` desde o fim de um combate com `exp-gain` até a fanfarra acabar |

`desiredMusic(state, cues)` → id de faixa ou `null`. Transições: título → lugar → batalha →
(vitória → lugar | lugar). Trocar de mapa durante a vitória cancela a fanfarra.

## Pedido de som (mixer)

| Campo | Tipo |
|-------|------|
| `track` | id da faixa ou cry |
| `source` | `"ui"` · `"own"` · `"other"` |
| `kind` | `"effect"` · `"cry"` |
| `x`, `y` | posição em px no mundo (ausente para `ui`) |
| `rate` | `playbackRate`, padrão 1 |

`mix(request, listener, cues)` → `{ gain, pan, priority }`, ou nada quando fora do alcance.
`admit(voices, request)` → toca, rouba a voz de menor prioridade ou descarta.

## Preferências de áudio (`AppSettings.audio`)

| Campo | Tipo | Padrão |
|-------|------|--------|
| `master` | inteiro 0–100, múltiplo de 5 | 80 |
| `music` | idem | 80 |
| `effects` | idem (inclui cries) | 80 |
| `muteUnfocused` | booleano | `false` |

Ganho final = `master/100 × (music ou effects)/100 × gain do mixer`.

## Entidade selvagem

`data.alert: true` enquanto a IA estiver em `chase` (protocolo 10). Ausente nas demais.
