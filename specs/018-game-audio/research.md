# Research: Áudio no jogo

**Feature**: [spec.md](spec.md) | **Plano**: [plan.md](plan.md)

## R1. Como tocar

- **Decision**: Web Audio API no renderer. Cada WAV é lido do `assets://stages/audio/`, decodificado com `decodeWav` (shared, 009) e virado `AudioBuffer`. Música com `loop = true`, `loopStart`/`loopEnd` em segundos a partir do `loop` do índice; faixa com `loop: null` toca uma vez.
- **Rationale**: `loopStart`/`loopEnd` dão loop sem corte por amostra (FR-004), a mixagem roda na thread de áudio e não pesa no quadro (FR-020). O formato IMA ADPCM do projeto não é garantido por `decodeAudioData`, e `decodeWav` já existe e é testado.
- **Alternatives considered**: `<audio>` com `loop` (não respeita introdução nem ponto de loop); Howler.js (dependência para o que a plataforma faz); tocar no processo main (latência e IPC por som).

## R2. Crossfade e "mesma música continua"

- **Decision**: dois `GainNode` de música; ao trocar de faixa, rampa linear de saída e entrada na mesma duração (`crossfadeMs`, padrão 800 ms, em `cues.json`). Se a faixa desejada for a que já toca, nada acontece. Troca pedida no meio de outro crossfade: a faixa que está saindo é parada e o crossfade recomeça do volume atual.
- **Rationale**: atende FR-002/FR-003 e o caso de ida e volta rápida por porta sem acumular faixas.
- **Alternatives considered**: fade-out e depois fade-in (cria silêncio, contra SC-001).

## R3. Diretor de música

- **Decision**: função pura `desiredMusic(state, cues)` com `state = { screen: "title" | "game", musicDay, musicNight, night, inCombat, victory }`. Prioridade: título → fanfarra de vitória ativa → batalha selvagem se em combate → música do mapa pelo período. O período é lido só ao entrar no mapa (edge case de dia virando noite).
- **Rationale**: testável sem áudio, e o cliente decide pelo próprio estado (FR-008). `inCombat` já existe no cliente (`view.self.kind === "pokemon"`, GameSession).
- **Alternatives considered**: servidor mandando a música (acopla apresentação ao servidor, contra o princípio IV).

## R4. Vitória, captura, fuga

- **Decision**: o combate termina com vitória quando o cliente recebeu `exp-gain` (oponente derrotado) desde que entrou em combate; aí toca o tema de vitória `SEQ_GS_WIN2` uma volta (até `loop.end`, já que no original ele repete) e, ao fim dela, a música do lugar. Captura (`capture.caught`), fuga ou derrota voltam direto à música do lugar.
- **Rationale**: não precisa de mensagem nova; `exp-gain` só chega quando um oponente cai.
- **Alternatives considered**: nova mensagem `combat-end` com motivo (muda o protocolo à toa).

## R5. Som de golpe

- **Decision** (revista na implementação): o arquivo de som nomeia os efeitos de golpe pelo número do golpe, `SEQ_SE_<GS|DP|PL>_W<id em 3 dígitos>` (172 faixas na extração). "Identificado" = existe uma faixa com esse nome, procurada nessa ordem. Senão, `archetypes["<id do arquétipo>"]` de `cues.json`; senão, `defaultMove`. O som toca quando o contador `data.used` do combatente sobe, com o golpe em `data.usedMove` (já replicados pelo spec 013).
- **Rationale**: cumpre FR-010 com dado extraído, sem mapa manual; o contador cobre todos os golpes, com ou sem entidade própria.
- **Alternatives considered**: um mapa manual `moves` em `cues.json` (plano original; descartado ao encontrar os nomes `W<id>`); extrair os scripts de animação (fora do escopo).

## R6. Atenuação, pan e limite de vozes

- **Decision**: ganho linear `1 − d / rangePx` (`rangePx` = 12 tiles), zero além do alcance; pan `clamp((x − centroDaCâmera) / meiaLarguraDaTela, −1, 1)` num `StereoPannerNode`. Prioridade: interface e próprio = 3, cry de terceiro = 2, efeito de terceiro = 1, desempate pelo ganho. Limite de 16 vozes; um som novo abaixo da menor prioridade em uso é descartado, senão rouba a voz de menor prioridade.
- **Rationale**: atende FR-012/FR-013 e SC-003 com regra simples e testável.
- **Alternatives considered**: `PannerNode` 3D (o jogo é 2D na tela; mais custo sem ganho).

## R7. Pré-carregamento

- **Decision**: ao entrar num mapa, carrega e decodifica as duas músicas do header, a de batalha selvagem e a fanfarra; no início da sessão, os efeitos de `cues.json` (são poucos e curtos). Cries carregam quando a espécie aparece no estado (entidade nova) e ficam em cache LRU de 64. O decode roda em um Web Worker para não travar o quadro.
- **Rationale**: FR-019 e FR-020; a música de batalha já está pronta antes do combate (FR-006 em < 1 s).
- **Alternatives considered**: carregar tudo no início (centenas de MB decodificados).

## R8. Wild "me notou"

- **Decision**: o servidor marca `data.alert = true` na entidade selvagem quando a IA passa para `chase` e tira quando sai. O cliente toca o cry na transição para `true`. Protocolo 9 → 10.
- **Rationale**: o cliente não tem como saber a IA hoje; uma flag nos dados da entidade usa a replicação existente.
- **Alternatives considered**: inferir pelo movimento (frágil); mensagem própria (mais protocolo).

## R9. Preferências

- **Decision**: `AppSettings.audio = { master, music, effects, muteUnfocused }`, volumes de 0 a 100 em passos de 5, padrão 80/80/80/false. O cliente aplica no `GainNode` na hora; `muteUnfocused` usa `blur`/`focus` da janela.
- **Rationale**: reusa `readSettings`/`settingsPatch` da spec 017 (campo inválido volta ao padrão).

## R10. Cries de desmaio

- **Decision**: o cry de desmaio toca o mesmo WAV com `playbackRate` 0,85, já que a extração gera um cry por espécie e forma.
- **Rationale**: aproxima o efeito do original sem nova extração; registrado em `docs/balance-log.md`.
