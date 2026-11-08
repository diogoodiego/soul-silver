# Pesquisa: Itens

Base: leitura do código existente (`server/items.ts`, `shared/game/items.ts`, `shared/game-data/items.ts`, `content/wild/balls.json`, `save/schema.ts`, `server/clock.ts`, handlers de script). Os dados da ROM não foram lidos neste passo; o que depende deles está marcado como **a sondar** e vira a primeira tarefa.

## R1. Mochila: uma porta só

- **Decisão**: `shared/items/bag.ts` puro, com `canAdd`, `addItem`, `removeItem` e o bolso vindo do `pocket` do item extraído. Limites em `content/items/pockets.json` (espécies por bolso e quantidade por pilha: itens 165, medicina 40, bolas 24, TMs 100 e HMs 8, berries 64, correio 12, itens de batalha 30, itens-chave 50; pilha 999, TM/HM 99). `GiveItem`, `TakeItem`, `HasItem`, `HasSpaceForItem`, loja, PC, chão, Kurt e achados chamam só essa porta.
- **Motivo**: hoje `hasSpaceForItem` e a loja decidem limite cada um do seu jeito (`BAG_ITEM_MAX` em `economy`). Uma porta evita que um caminho esqueça o limite do bolso.
- **Alternativas**: manter a lista plana e validar em cada chamador (rejeitado: foi a origem dos desvios); trocar o save por uma estrutura por bolso (rejeitado: o bolso é derivável do item, não precisa migração de formato).
- **A conferir**: os números originais de limite; se divergirem, o dado extraído vence e o `pockets.json` é ajustado.

## R2. Efeitos em dados, derivando o que já foi extraído

- **Decisão**: `effects.json` mapeia item → arquétipo + parâmetros. Cura, revive, cura de status e PP leem os bytes de `partyUse.params` já extraídos (como `hpRestore`); o arquivo só diz o arquétipo e os tempos. TM e HM: o golpe vem do item (parâmetro de máquina) e a compatibilidade do learnset extraído. Pedras: a espécie-alvo vem das evoluções extraídas (`use-item`, `use-item-male/female`).
- **Motivo**: princípio I e III, e menos tabela à mão para errar. O relatório de cobertura (R10) mede o que sobrou sem arquétipo.
- **Alternativas**: tabela completa à mão (rejeitado: centenas de itens, sujeita a erro); interpretar `fieldUse`/`battleUse` do original como código (rejeitado: são ids de função, não dados).

## R3. Uso em combate: ação do treinador

- **Decisão**: `TrainerAction { item, target, endsAtTick }` em `Combat`, com recarga própria do treinador. Enquanto roda, o Pokémon não ataca com golpes, mas pode se mover e é atingido normalmente; o efeito só se aplica no tick final; desmaio cancela sem gastar o item. O servidor reserva o item (decrementa só na aplicação) e recusa pedido de segundo uso durante o uso ou a recarga. Tempo de uso e recarga em `tuning.json` por arquétipo, com exceção por item.
- **Motivo**: é a leitura direta de "tempo de uso, pode ser atingido, recarga". Decrementar só na aplicação evita perder o item por desmaio ou desconexão (edge cases do spec).
- **Alternativas**: item instantâneo com recarga (rejeitado: contradiz "o Pokémon pode ser atingido durante o uso"); congelar o Pokémon (rejeitado: tira o controle, o oposto do requisito de gamepad).
- **Decisão em aberto de equilíbrio**: se o Pokémon pode se mover durante o uso. Padrão: sim; um parâmetro `lockMovement` por arquétipo em `tuning.json` permite inverter sem mudar código. Registrar em `docs/balance-log.md`.

## R4. PP como cooldown

- **Decisão**: o PP original deixa de existir (spec 011/012). Equivalentes:
  - **Ether**: reduz a recarga restante de um golpe em `ether.seconds` (dado), a partir do PP restaurado original convertido pela recarga base do golpe.
  - **Elixir**: o mesmo para todos os golpes.
  - **PP Up**: `ppUps[golpe]++` (máximo 3); a recarga base passa a `base ÷ (1 + 0,2·n)`, a mesma razão do PP original (+20% de PP por nível).
  - **PP Max**: `ppUps[golpe] = 3`.
- **Motivo**: preserva as razões originais e o limite de 3 usos; PP Up deixa de ser inútil. O membro do grupo ganha `ppUps` (save v11).
- **Alternativas**: Ether como "zera a recarga" (rejeitado: torna o item dominante); ignorar PP Up (rejeitado: o spec exige efeito).
- Cada uma vira entrada em `docs/balance-log.md` (original, novo, motivo).

## R5. Itens segurados

- **Decisão**: o item extraído já traz `holdEffect {id, parameter}`. `held.json` mapeia cada `id` de efeito (não cada item) para um gatilho:

  | Gatilho | Exemplos originais | Adaptação ao tempo real |
  |---------|--------------------|-------------------------|
  | `hp-threshold` | Oran, Sitrus, Berry Juice | consome ao cruzar o limiar; cura aplicada com o número na tela |
  | `status` | Cheri, Chesto, Pecha, Lum | consome ao receber o status |
  | `regen` | Leftovers | cura 1/16 do HP máx a cada 1 s de luta |
  | `damage-mod` | Choice Band, type boosters, Muscle Band | multiplicador no cálculo de dano |
  | `survive` | Focus Sash, Focus Band | sobrevive com 1 HP uma vez (Sash) ou por chance (Band) |
  | `speed-mod` | Choice Scarf, Quick Claw | multiplicador de velocidade ou chance de reduzir a recarga |
  | `once-per-fight` | demais de uso único | consome no primeiro gatilho válido |

  Efeitos sem equivalente em tempo real (ex.: dependem de ordem de turno) ficam fora do mapa e aparecem no relatório de cobertura; só precisam estar mapeados os obtíveis até Violet City.
- **Motivo**: mesmo molde dos arquétipos de golpe (princípio III); mapear por `holdEffect.id` evita uma linha por item.
- Dar/tirar: mensagem `set-held` (item da mochila ↔ `held` do membro), validada pelo servidor; o Pokémon que desmaia perde o item só se ele for consumível já consumido.

## R6. Itens do chão e escondidos — **a sondar**

- **Decisão**: usar os eventos extraídos (spec 020). Item no chão é um objeto de mapa com script de "pegar item"; escondido é um evento de fundo com script/flag. Cada pegada marca a flag do jogador (as flags por jogador já existem).
- **Sondagem (T001)**: conferir se os eventos extraídos já distinguem os dois e carregam o item e a flag; se faltar, estender o estágio `events` do extrator. A camada 3 usa as rotas 29 a 31 como alvo.
- **Dowsing**: o servidor acha o escondido não coletado mais próximo no mapa do jogador, dentro de `dowsing.radius` (tuning), e envia direção e proximidade; coletar sem o aparelho continua possível no ponto exato, como no original.
- **Alternativas**: o cliente calcular a direção (rejeitado: a lista de escondidos não coletados é estado do servidor; o cliente nunca a recebe inteira).

## R7. Árvores de berry e apricorn — **a sondar**

- **Decisão**: `trees.ts` com estados `vazio → plantado → brotando → crescendo → florescendo → com frutos`, tempos por berry. Apricorn tem a mesma estrutura, com um tempo único de rebrota.
- **Sondagem**: os dados de crescimento de berry existem nos dados do jogo (tabela de berries); conferir se o extrator os lê. Se não, escrever `content/items/berries.json` à mão com a origem citada e marcar a divergência.
- **Estado**: por jogador no save (`trees`), sobre o relógio da sessão (que já aceita injeção); relógio do host voltando não regride estágio nem duplica frutos (guarda `max(plantedAt, now)`).
- **Alternativa**: estado da árvore compartilhado (rejeitado: contradiz FR-013/US5 AC6 e o princípio VII).

## R8. Kurt e achados do companheiro — **a sondar**

- **Kurt**: o script original do Kurt usa comandos de apricorn; confirmar se o interpretador já os trata. Estado por jogador `kurt: { order: { apricorn, readyAt } | null }`, prazo original (um dia) sobre o relógio da sessão; `content/items/kurt.json` mapeia apricorn → bola (a bola "Level/Lure/..." já existe em `balls.json`).
- **Achados**: `content/companion/finds.json` por lugar (`Place` já existe em `shared/companion`) com tabela de itens e intervalo. Se a tabela não estiver na ROM, fica escrita à mão com a origem citada e o desvio registrado.

## R9. Repel

- **Decisão**: efeito por jogador `{ level, endsAt }` no save. Duração original em passos (100/200/250) convertida pelo tempo de um passo (constante de movimento já existente) e arredondada, em `tuning.json`. `wild.ts` multiplica o teto de spawns perto do jogador por `repel.density` (dado); a IA do selvagem de nível menor que o do companheiro daquele jogador entra em estado passivo (não se aproxima nem ataca) só em relação a ele. Selvagem já em combate não muda.
- **Motivo**: princípio VII, selvagens compartilhados e efeito por jogador.

## R10. Relatório de cobertura

- **Decisão**: `scripts/items-coverage.ts` (`npm run items:coverage`), mesmo molde do relatório de golpes (`content/combat/coverage.json` + `combat-coverage.test.ts`): lê a extração local, lista todo item sem arquétipo (e todo segurado sem gatilho) e sai com código 1 se algum item do conjunto obtível até Violet City estiver na lista. O conjunto obtível é calculado dos eventos, lojas e presentes extraídos; a CI usa uma fixture sintética com o mesmo contrato (princípio II).
- **Alternativa**: lista fixa em JSON (rejeitado: envelhece; o cálculo dos dados não).

## R11. Protocolo e save

- Protocolo 20 → 21; save 10 → 11 (ver `contracts/`). `use-item` existente passa a aceitar `moveIndex` opcional (TM/HM e PP) e a despachar por arquétipo; fora de combate continua valendo a recusa atual para itens só de combate.

## Resultados da sondagem (Phase 1, 2026-11-07)

Lidos na extração local (US, `%APPDATA%/SoulSilver Desktop/extraction`) e no código.

- **T001, itens do chão**: já funcionam. São objetos com script 7000+N (arquivo 141): a entrada N põe item e quantidade em `0x8008/0x8009` e vai a L256, que faz `HidePerson` (marca a `hideFlag` do objeto, por jogador) e `GiveItem`. 257 objetos na ROM. Nada a extrair.
- **T001, escondidos**: são `signs` com `kind: 2` e script 8000+N (arquivo 145, 231 scripts). O script lê item, quantidade e flag de `0x8000/0x8001/0x8002`, que o jogo preenche a partir da tabela `sHiddenItemParam` na ARM9 (offset `0xfa558`, 231 registros de 8 bytes: `u16 item, u8 qty, u8 0, u16 0, u16 índice`). A busca é pelo `u16` em +6 igual a `script − 8000`; a flag é `script − 7200` (função em ARM9 `0x405a0`: `sub r0, 0x1c20`). Hoje o servidor roda o script sem preencher as variáveis (daria o item 0): o estágio `events` passa a gravar `hidden-items.json` e o host de scripts preenche as variáveis. O sinal fica invisível ao jogador quando a flag dele está marcada.
- **T002, berries**: o HGSS não tem árvores de berry no mapa; berries crescem nos **Berry Pots** (item-chave 470, 4 vasos) regados com o **SquirtBottle** (477). Dados de crescimento: NARC `a/0/6/6`, 64 registros de 12 bytes (`u16 tamanho, u8 firmeza, u8 ?, u8 horas por estágio, u8 secagem, 5 sabores, u8 suavidade`); Cheri = 3 h por estágio, Oran = 4 h, Sitrus = 8 h. A produção depende da rega no original; aqui fica fixa em `tuning.json` (desvio no `balance-log.md`).
- **T002, apricorns**: 31 árvores (objetos com script 2800, `param[0]` = índice da árvore), script comum no arquivo 150: exige o Apricorn Box (468), `AnimApricornTree` (0 = já colhida hoje), `ApricornTreeGetApricorn` (cor pela tabela da ARM9 em `0x108413`, 31 bytes de 0 a 6), `GiveApricornFromTree` (vai para o Apricorn Box, não para a mochila). Rebrota uma vez por dia. O save ganha as contagens do Apricorn Box e as árvores colhidas no dia.
- **T003, Kurt**: script 874 usa `GetTotalApricornCount`, `ScrCmd_735` (estado da encomenda), `ScrCmd_739` (abre a caixa para escolher o apricorn), `ScrCmd_737` (bola pronta), `ClearKurtApricorn`. A bola fica pronta no dia seguinte. Cor → bola: vermelho Level, amarelo Moon, azul Lure, verde Friend, rosa Love, branco Fast, preto Heavy.
- **T003, achados do companheiro**: a tabela original não foi localizada; fica em `content/companion/finds.json` escrita à mão, com o desvio registrado.
- **T004**: o membro do grupo não tem `held` nem `ppUps`. Decisão: campos opcionais em `partyMember` (ausente = nada / zero), como `nickname` e `shiny`, sem reescrever cada membro na migração. Ação do treinador fica na sessão (estado por jogador) e usa métodos novos do combate (`heal`, `cure`, `shortenCooldown`, `raiseStage`); itens segurados entram em `combat.ts` em `hurt`, `inflict`, `damageOf`, `speedOf` e no passo (regen).
- **T005**: limites seguem as constantes do código, como `PC_ITEMS_MAX` e `BAG_ITEM_MAX` (motor do original, não conteúdo): itens 165, medicina 40, bolas 24, máquinas 101, berries 64, correio 12, batalha 30, chave 50; pilha 999. Repel 100, Super 200, Max 250 passos. `pockets.json` não é criado.

## T070: o item escondido 8001 (Phase 12)

- O sinal `kind: 2` com script 8001 (Nugget, flag 801) está nos eventos da Route 29 (mapa 33) e da Route 30 (mapa 34), no tile (572,390) da matriz.
- Pelas origens do mundo extraído, esse tile fica dentro de Cherrygrove City (mapa 67: origem 512,384, 64×32 tiles), a 3 tiles da divisa com a Route 29 (origem 576,384). Os eventos de Cherrygrove não o listam.
- Em aberto: no original, o jogador acha esse item andando em Cherrygrove (o jogo consultaria os eventos de mapas vizinhos)? Confirmar na decomp (pret/pokeheartgold, carga dos bg events por mapa) antes de mudar a busca de sinais em `scripts.ts`. Até lá, a sonda do Dowsing falha nesse item.

## Acréscimos fora do plano (Phase 12, T077)

- **`debugSetStatus`** (protocolo v21, só build de desenvolvimento com o depurador de scripts): a sonda da camada 3 precisa de um Pokémon com status para provar cada remédio de status em combate; nenhum caminho do cliente aplica status sem um golpe. Mesmo portão de `debugSetHp`.
- **Limites no `debugWarp`**: tentado e revertido (Phase 12). O caminho dourado usa de propósito um warp a um tile além da borda de Cherrygrove para entrar na Route 29; recusar quebrava o marco 6. O risco (um warp longe da grade grava um save incoerente, como aconteceu no slot 3) fica com quem usa o comando de desenvolvimento.
- **Buffer de texto `move`**: `BufferTMHMMoveName` do script de bola de item (arquivo 141) mostra o golpe da MT; sem ele a mensagem da MT ficaria sem o nome.
- **Bola de item marca a hide flag**: o original apaga o objeto e marca a flag dele; só com `HidePerson` a bola voltava ao entrar de novo no mapa. Limitado ao arquivo 141 para não mudar `HidePerson` nas cenas.
