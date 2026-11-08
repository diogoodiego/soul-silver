# Research: Tempo e Pokégear

Estado: R1 a R6 são decisões de projeto sobre o código atual (lido neste plano). **R7 não está resolvido**: nenhum formato de ROM foi lido, e as tarefas T001 e T002 existem para isso.

## R1. Um relógio injetável

- **Situação atual**: `game-server.ts` passa `hour: () => new Date().getHours()` e `weekday: () => new Date().getDay()`; `session.ts` usa `options.hour ?? (() => 12)` e `options.weekday ?? (() => 0)`; `wild.ts` e as reações do companheiro recebem `hour`. São fontes separadas.
- **Decisão**: `createSessionClock({ source: () => Date, bands })` em `server/clock.ts`, com `now()`, `hour()`, `minuteOfDay()`, `weekday()`, `band()` e `set(mode)`, em que `mode` é `{ kind: "host" }`, `{ kind: "fixed", at }` ou `{ kind: "offset", ms }`. `hour`/`weekday` das opções existentes viram `clock.hour`/`clock.weekday`. Os testes injetam `source`.
- **Racional**: os testes da camada 2 pedem relógio injetável (spec). Um objeto só evita duas partes do servidor discordarem da hora no mesmo tick.
- **Faixas**: `timeOfDay(hour, bands)` já existe em `shared/wild/time-of-day.ts` e lê `spawn.json` (`morning: 4`, `day: 10`, `night: 20`). Fica como única fonte; a tonalidade a reusa.
- **Alternativas**: relógio por jogador (contradiz o spec); trocar `Date` global em teste (frágil, global).

## R2. Tonalidade contínua

- **Decisão**: `tintAt(minuteOfDay, palette)`. A paleta tem uma cor (`r,g,b` multiplicativos, 0–1.5) por faixa e `transitionMinutes` (padrão 60). Em cada limite de faixa, a cor interpola linearmente por `transitionMinutes` centrado no limite; fora das janelas a cor é a da faixa. A função é periódica em 1440 min, então não há salto à meia-noite.
- **Onde aplica**: só em mapas com `areaType === "outdoor"` do cabeçalho (extraído, spec 025 R1). `indoor` e `cave` ficam sem cor.
- **Transmissão**: o servidor envia `{ minuteOfDay, weekday, fixed }`; o cliente avança localmente entre mensagens e chama `tintAt`. Não manda a cor, para o teste de unidade cobrir a função usada de verdade.
- **Teste**: continuidade provada por amostragem, `|tint(m+1) − tint(m)| ≤ ε` para os 1440 minutos, e valor exato no meio de cada faixa. Também o caso da paleta com `transitionMinutes` 0 (salto permitido só se pedido).
- **Desvio de fidelidade (I)**: o original troca a paleta de iluminação do modelo 3D. Aqui é multiplicação de cor sobre a cena, por simplicidade. Registrar em `docs/balance-log.md`. Valores de `tint.json` são escolha visual, ajustada na camada 4.
- **Alternativas**: paleta por faixa sem transição (viola o spec); calcular a cor no servidor (envia mais dados e testa uma cópia).

## R3. Eventos por dia da semana e horário

- **Situação atual**: `GetWeekday` já escreve `host.weekday()` na variável do script; `host.hour()` existe.
- **Hipótese a verificar (T003)**: o original esconde ou mostra NPCs por dia dentro dos scripts de carga do mapa, que leem `GetWeekday` e ligam ou desligam flags de visibilidade. Se o servidor já roda esses scripts na entrada do mapa, não há código novo de "evento por dia", só o relógio correto e, no máximo, um `GetTimeOfDay` se faltar.
- **Verificar**: (a) o comando de horário que os scripts usam existe em `command-table.ts`; (b) os scripts de carga rodam na entrada do mapa e depois de `debugSetClock` (decidir se uma troca de relógio reexecuta os da área atual, ou só vale na próxima entrada como no original).
- **Decisão provisória**: vale na próxima entrada do mapa, como no original; a sonda fixa o dia e entra no mapa.
- **Sonda**: varre `script.json` extraído por `GetWeekday`/horário até Violet City e gera a lista de eventos; para cada um, dia certo e um errado.
- **Alternativas**: reexecutar na hora quando o dia muda com o jogador parado (o original não faz; descartado).

## R4. Ligações e fila de entrega

- **Decisão**: `server/phone.ts` guarda por jogador uma fila ordenada `pending: PendingCall[]`. A cada minuto de relógio da sessão e a cada fim de estado ocupado, o servidor tenta entregar a primeira da fila se `!field.busy(id)` e não houver chamada em curso. Entregar envia `phone-call` ao jogador; a ligação ocupa o jogador como um script (`busy`) até terminar.
- **Quando uma ligação surge**: `callDue(contact, state, minuteOfSession, rng)` puro em `shared/phone/calls.ts`. Os dados da ROM (R7) dizem a faixa de horário e o dia aceitos por contato e a cadência; ligações de história vêm de `SetPhoneCall` e entram direto na fila, sem sorteio.
- **Ocupado**: reusa `field.busy` (menu, script, combate, treinador, progressão). Pokégear aberto é `menuOpen`, então espera. A chamada em curso é sua própria trava, para uma segunda não aninhar.
- **Perda**: a fila de ligações de história vai para o save e sobrevive; as sorteadas ficam só na memória e se perdem ao desconectar (decisão que o spec marcou como padrão).
- **Teste (camada 2)**: três cenários com `source` injetado: combate, script (cutscene) e menu aberto. A ligação vence o relógio, não é entregue; ao liberar o jogador, é entregue uma vez; duas pendentes saem em ordem.
- **Alternativas**: entregar na hora e deixar o cliente enfileirar (o cliente não é autoritativo e o estado se perde na reconexão).

## R5. Revanche por jogador

- **Decisão**: a revanche de um treinador é um campo de `save.phone.contacts[id]` (`rematch: "none" | "ready" | "won"`), por jogador. Aceitar muda o estado para `ready` e, no servidor, `trainer-battles` consulta esse estado do jogador para escolher o time: o de revanche extraído em vez do original e marcar o treinador como desafiante de novo para esse jogador (o filtro de visibilidade por flags já existe, spec 022).
- **Dependência**: de onde vem o time de revanche (R7). Se for uma segunda entrada na tabela de treinadores, o extrator só precisa ligar contato → id de treinador de revanche.
- **Teste**: dois jogadores, A aceita; B continua vendo o time normal; A vê o de revanche.

## R6. Rádio e densidade de spawns

- **Decisão**: `content/radio/channels.json` lista canais com `id`, `textBank` (ou ids de texto) e `effect: { kind: "none" } | { kind: "spawnDensity", factor, bands?: [...] }`. Escrito à mão, com a origem citada (arquivo e símbolo da decomp, R7).
- **Aplicação**: `wild.ts` calcula, por área, `cap_efetivo = round(cap × média do fator dos jogadores que estão na área e têm um canal com efeito ligado)`. Jogadores sem efeito entram com 1. Selvagens são compartilhados (VII), então o efeito pesa só no momento de gerar, nunca remove os já existentes.
- **Canal de cada jogador**: estado do servidor por jogador (`radio.tuned`), zerado ao desconectar, sem ir ao save.
- **Desvio de fidelidade (I)**: o original muda a taxa de encontro aleatório; aqui não há encontros aleatórios (visão do projeto), então vira multiplicador do teto. Registrar em `docs/balance-log.md`.
- **Teste (camada 1)**: para cada canal do arquivo, `capFor(base, players)` bate com o fator; canal sem efeito não muda; vários jogadores na área tiram a média.
- **Alternativas**: o efeito do canal vale para o mapa inteiro enquanto qualquer jogador o ouvir (um jogador altera o mundo dos outros; descartado).

## R7. Dados da ROM (T001 e T002, resolvido em 2026-11-07)

Fonte: pret/pokeheartgold, clone raso no scratchpad da sessão, fora do repositório. Arquivos citados abaixo.

### 1. Tabela de contatos: arquivo próprio, fácil de extrair

- **Arquivo**: `tel/pmtel_book.dat` no sistema de arquivos da ROM (`src/phonebook_dat.c`, `files/tel/pmtel_book.json`). Formato: `u32 count`, depois `count` registros `PhoneBookEntry` de 20 bytes (`include/gear_phone.h`):
  `u8 id, u8 type, u8 unk2, u8 trainerClass, u16 trainerId, u16 mapId, u16 gift, u16 phoneScriptIfLocal, u8 unkC, u8 rematchWeekday, u8 rematchTimeOfDay, u8 unkF, u8 sortParam[4]`.
- `id` vai de 0 a 74 (`include/constants/phone_contacts.h`; 0xFF = nenhum). `rematchWeekday` é 0 (domingo) a 6, ou 7 (`RTC_WEEK_MAX`) para "sem dia"; `rematchTimeOfDay` é 0 manhã, 1 dia, 2 noite, ou `TIMEOFDAY_WILD_MAX` para "sem faixa". `unkF` é a camada da ligação aleatória (0, 1 ou 2, ver abaixo). `type` 0 é treinador comum; 10, 11, 12 e 14 também recebem ligações aleatórias.
- **Joey** (contato 10): `TRAINER_YOUNGSTER_JOEY`, `MAP_ROUTE_30`, presente `ITEM_HP_UP`, roteiro local `PHONE_SCRIPT_029`, revanche **segunda-feira de dia**, camada 1.
- **Elm** (contato 1): `type` 2, laboratório de Elm, sem revanche.
- **Texto por contato**: um banco de mensagens por contato, tabela `sPhoneMessageGmm` em `src/phonebook_dat.c` (Elm 716, Joey 675, cumprimentos genéricos 640). Os bancos 640 a 716 já saem no catálogo de textos do spec 005.

### 2. Textos de ligação: tabelas em código, no overlay 101

- Cada roteiro (`PHONE_SCRIPT_001` a cerca de 466, `include/constants/phone_scripts.h`) é uma entrada `{ msgIds[2], scriptType, param0, param1 }` em `src/application/pokegear/phone/phone_script_defs.c`. `msgIds` são as falas (o par é masculino/feminino). `scriptType` diz o efeito: `PHONESCRIPTTYPE_REMATCH` liga a revanche, e também há presente e enxame.
  - Joey: `PHONE_SCRIPT_029` a `035`, banco 675, falas 6 a 12; a 033 é a de revanche (`REMATCH`, `param0 = 1`).
- `sGenericPhoneCallHeaders` (`phone_generic_headers.c`) escolhe o roteiro de cada contato por tipo e chance; `sGreetingMsgIDs` dá o cumprimento por direção (feita ou recebida) e faixa (manhã, dia, noite).
- **Não estão num arquivo de dados**: são `const` dentro do overlay 101. **Decisão**: o extrator lê essas duas tabelas do binário do overlay 101 por offset. Os offsets ainda não foram descobertos; os dois arrays têm estrutura fixa, então dá para achá-los por assinatura (como no spec 025 com os pontos de voo). Se a busca falhar, o caminho alternativo é o de `content/field/moves.json` no spec 025: uma tabela escrita à mão só com os ids das falas e dos roteiros, sem nenhum texto, citando o arquivo da decomp. Os textos continuam vindo da extração.

### 3. Quando chega uma ligação aleatória (`src/field/overlay_2_gear_phone.c`, `src/unk_02092BE8.c`)

- Um contador de passos sobe a cada passo. A partir de 10 passos (`unk_varC = 10`), cada passo rola 50% (`unk_var12 = 50`). Se passar, escolhe a camada (0: 50%, 1: 30%, 2: 20%) e sorteia entre os contatos registrados daquela camada e dos tipos 0, 10, 11, 12 e 14. Ficam de fora os contatos que estão no mesmo mapa que o jogador e os que já ligaram nesta rodada (o save guarda a lista por camada e a zera quando todos já ligaram).
- O mapa precisa permitir ligações (`MapHeader_CanReceivePhoneCalls`).
- **Gatilhos de história** (`CALL_TRIGGER_*`, `include/constants/phone_constants.h`) têm prioridade sobre as aleatórias; alguns forçam o atendimento.
- **Desvio de fidelidade (I)**: aqui o contador é por passos de tile do jogador, contados no servidor. É o mesmo modelo, e não "minuto de relógio" como o plano dizia. **Corrige R4**: a cada passo, não a cada minuto. Registrar no balance-log só se o número de passos ou a chance mudar.

### 4. Revanche: outra entrada na tabela de treinadores

- `sTrainerRematchSets` (`src/overlay_26_022598C0.c`) traz uma linha por treinador de revanche: `{ base, base, _2, _3, _4, NONE }`. Joey: `JOEY, JOEY, JOEY_2, JOEY_3, JOEY_4`. Os líderes de ginásio só têm `_2`.
- **O time de revanche é o treinador `_N` da tabela de treinadores extraída** (spec 022). Escolha (`TryGetRematchTrainerIdByBaseTrainerId`): o primeiro `_N` ainda não vencido por aquele jogador (`TrainerFlagCheck`), limitado pelo grupo liberado (flag `FLAG_UNK_97B + N`, ligada pela história). Se o grupo não estiver liberado, volta ao anterior.
- **Por jogador**: `PhoneRematch.seeking` por contato, em `PhoneCallPersistentState` (`include/save_pokegear.h`). `GetPhoneBookRematch` só devolve o id se `seeking` estiver ligado (e, para o contato 16, Kenji, só de dia).
- **Como a revanche acontece no original**: é por script. O script do NPC chama `GetPhoneBookRematch`, recebe o id do treinador `_N` e chama a batalha com esse id. O time não é trocado no código de batalha. **Corrige R5**: em vez de `rematch: none|ready|won` e de um desvio em `trainer-battle.ts`, basta implementar `GetPhoneBookRematch` sobre `seeking` por jogador e a tabela de revanche. O "venceu" já é a flag de treinador por jogador, e `trainer-battle.ts` já recebe o id do script.
- `sTrainerRematchSets` é `const` no overlay 26. Mesma decisão do item 2: ler por offset ou, se falhar, tabela de ids escrita à mão com a origem citada.

### 5. Rádio (T002)

- **Programas e textos**: um banco por programa (`src/application/pokegear/radio/shows/*.c`):

  | Banco | Programa |
  |-------|----------|
  | 409 | sinal de Mahogany |
  | 410 | Unown |
  | 411 | Buena's Password |
  | 412 | comerciais |
  | 413 | radionovela |
  | 414 | Pokémon Talk |
  | 415 | That Town, These People |
  | 416 | Pokémon Music |
  | 417 | Poké Flute |
  | 418 | Team Rocket |
  | 419 | Pokémon Search Party |
  | 420 | Trainer Profiles |

- **A ordem e a escolha das falas é código**: muitos programas sorteiam ou escolhem pelo dia da semana (por exemplo `pokemon_talk.c` e `pokemon_music.c`). "Textos na ordem" vale dentro de cada segmento; não existe uma lista fixa por canal.
- **Canais disponíveis por lugar** (`Radio_GetAvailableChannels`, `pokegear_radio.c`): sem sinal, Ruins of Alph, Kanto (depois de restaurar a energia; com o Expansion Card a lista cresce), Mahogany (antes de limpar o esconderijo), Rocket (durante a tomada da torre) e Johto.
- **Efeitos no jogo** (`src/field/encounter_check.c`, `GetRadioMusicPlayingSeq`):
  - **Pokémon March**: +25 na taxa de encontro (base modificada 40, máximo 100).
  - **Pokémon Lullaby**: −25.
  - **Unown** (Ruins of Alph): muda a escolha de forma do Unown.
  - **Sons de Hoenn e de Sinnoh**: trocam espécies nos slots 2 a 5. Fora do escopo pelo spec.
  - **Poké Flute**: sem efeito de encontro; acorda o Snorlax por script (`RadioMusicIsPlaying`).
- **March e Lullaby saem do Pokémon Music pelo dia da semana** (`pokemon_music.c`):
  - March: segunda, sexta, domingo sem o GB Sounds e quarta sem a National Dex.
  - Lullaby: terça, sábado e quinta sem a National Dex.
  - Quarta e quinta com a National Dex tocam Hoenn e Sinnoh.
- **Corrige R6**: o efeito não é "por canal" fixo, é a música que toca. `content/radio/channels.json` passa a ter o efeito por música (`march: +25`, `lullaby: −25`, em pontos percentuais sobre a base 40). Na tradução para o teto de spawns, o fator é `(40 + Δ) / 40`: 1,625 para March e 0,375 para Lullaby. O desvio vai para o balance-log.

### 6. Comando de horário nos scripts

- `ScrCmd_379` é o `GetTimeOfDay` do original (`scrcmd_c.c`: `Field_GetTimeOfDay`). Já existe na tabela e tem um atalho em `packages/shared/src/script/handlers/center.ts` que sempre devolve 2. **T026 passa a ser obrigatória**: devolver a faixa RTC da hora do relógio da sessão.
- **Há cinco faixas RTC** (`gf_rtc.c`, `GF_RTC_GetTimeOfDayByHour`): `LATE` 0–3, `MORN` 4–9, `DAY` 10–16, `EVE` 17–19, `NITE` 20–23.
- As três faixas de encontro (manhã 4–9, dia 10–19, noite 20–3) agrupam `DAY` com `EVE` e `NITE` com `LATE` (`GF_RTC_GetTimeOfDayWildParamByHour`). Os scripts usam as cinco; `spawn.json` e a tonalidade usam as três.
- **Consequência para a tonalidade**: o spec pede manhã, dia e noite, e isso continua. A paleta pode ter a cor do entardecer depois; fica como opção, não como requisito.

**Plano de contingência** (mantido): se a busca por offsets dos itens 2 e 4 falhar, ficam as tabelas de ids escritas à mão (sem texto), com a origem citada, como no spec 025.

## R9. Código do servidor (T003 e T004, resolvido)

- **Scripts de carga na entrada do mapa**: já rodam. `enterMap` em `packages/server/src/scripts.ts` (por volta da linha 650) executa `onTransition`, `onLoad` e `onResume` do mapa, e `GetWeekday` lê `host.weekday()`. Não falta código de "evento por dia"; falta o relógio da sessão no host e o `ScrCmd_379` (R7.6).
- **Mudar o relógio com o jogador parado**: vale na próxima entrada do mapa, como no original. `debugSetClock` não reexecuta os scripts da área. A sonda entra no mapa depois de fixar o dia.
- **Time de batalha**: `prepare(f, trainerId, override?)` em `packages/server/src/trainer-battle.ts` lê `data.trainer(trainerId)`. O id vem do script, então a revanche usa o id `_N` que `GetPhoneBookRematch` devolve, sem mudança em `trainer-battle.ts` (R7.4). A tabela de treinadores extraída precisa conter `YOUNGSTER_JOEY_2..4`; a T030 confere.

## R8. Tela do Pokégear

- **Decisão**: `MenuPage` ganha `"gear"`; `Gear.svelte` renderiza as quatro abas. O mapa parte de `FlyMap.svelte`, sem a seleção de destino, com os outros jogadores vindos do estado público da sessão (já enviado para o painel `OnlinePanel`). A tela de chamada é um bloco que o servidor abre (`phone-call`), no mesmo canal dos diálogos de script.
- **Isenção**: UI não segue test-first; a camada 4 cobre as capturas 05 a 09.
