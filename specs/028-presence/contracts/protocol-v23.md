# Contrato: protocolo v23

`PROTOCOL_VERSION` 22 → 23 (`shared/src/protocol-version.ts`); apps de versões diferentes recusam a conexão. Mensagens em `shared/src/game/protocol.ts`, todas `strictObject`. O save não muda.

Item 028.2 do roadmap: o fluxo da troca entre dois jogadores. Item 028.3: na confirmação final a troca é aplicada (seção "Troca atômica"), sem mensagem nova e sem mudança no save; por isso a versão continua 23.

## Cliente → servidor

| Mensagem | Campos | Regra do servidor |
|----------|--------|-------------------|
| `trade-propose` | `to`: id do jogador | recusa com `notice` `trade-far` se o outro está noutro mapa ou a mais de 48 px (3 tiles); `trade-busy` se algum dos dois está em combate, em cena ou já numa troca; `action-refused` para si mesmo ou um id que não está na sessão |
| `trade-answer` | `accept` | só o convidado, só enquanto o convite está aberto; recusar cancela |
| `trade-offer` | `offer: { party, items }` | substitui a oferta inteira e zera as duas confirmações (volta a `open`, também do passo final); recusa (`action-refused`) posição de equipe repetida ou fora da equipe, item repetido ou mais do que há na mochila, ou antes de o convite ser aceito |
| `trade-confirm` | — | uma confirmação; as duas levam a `final`, e mais duas em `final` levam a `done` |
| `trade-cancel` | — | qualquer lado, em qualquer fase; termina a troca para os dois |

`offer.party`: índices 0–5, no máximo 6. `offer.items`: até 20 itens, cada um com `count` de 1 a 999.

## Servidor → cliente

| Mensagem | Conteúdo |
|----------|----------|
| `tradeState` | `phase`, `partner` (id do outro jogador), `mine` e `theirs` (ofertas), `confirmed: { mine, theirs }` |

Fases: `waiting` (quem propôs), `invited` (o convidado), `open`, `final`, `done`, `cancelled`. As duas últimas encerram a troca: os dois ficam livres para outra.

## Cancelamento automático

A cada tick o servidor cancela a troca quando um dos dois entra em combate (selvagem, treinador ou, quando existir, duelo entre jogadores), entra numa cena, troca de mapa ou se afasta mais de 48 px. Sair da sessão (ou cair) também cancela. O menu aberto não bloqueia nem cancela.

## Troca atômica (028.3)

1. Na última confirmação final, o servidor confere de novo as duas ofertas contra o que cada jogador tem agora e aplica as duas numa única operação síncrona: tira de um, entrega ao outro, nos dois sentidos. Se uma oferta não vale mais, ou se alguém ficaria sem Pokémon, com mais de 6 na equipe ou com mais de 999 de um item, nada muda e a troca termina `cancelled`.
2. Logo depois, o servidor manda um `save` a cada um e guarda o rev até o `save-ack` daquele jogador.
3. Queda antes da confirmação final (proposta, confirmação, primeira confirmação final): a troca é cancelada e nada muda.
4. Queda durante a gravação (troca aplicada, `save-ack` ainda não recebido): o servidor guarda o progresso já trocado na reserva do jogador. Essa reserva **não expira** enquanto o save da troca não for confirmado, e a volta do jogador, **com ou sem** `resumeToken`, recebe esse progresso e um `save` na hora. O arquivo antigo que o cliente manda no `hello` é ignorado nesse caso.

5. **Livro de trocas pendentes do anfitrião.** Antes de mandar o save da troca, o servidor anota esse save em `trades-pending.json`, na pasta de dados do app do anfitrião (gravação atômica, uma de cada vez). O `save-ack` tira a anotação. Numa partida seguinte do **mesmo anfitrião**, um jogador que entra com um save de rev menor que o anotado recebe o save anotado, e o arquivo antigo é ignorado. Um save com rev igual ou maior apaga a anotação, porque o cliente já tinha gravado. Cada anotação lida do arquivo passa pela mesma validação de um save vindo da rede. Uma anotação inválida é descartada com log, e um arquivo ilegível começa vazio.

Limites:
- O livro fica só no PC do anfitrião. Se o jogador que caiu entrar na partida de **outro** anfitrião, ou jogar sozinho, antes de voltar a esse, o save antigo é aceito, e o Pokémon trocado existe nos dois saves. Fechar isso exige um registro da troca dentro do próprio save, com versão nova do save.
- O livro identifica o jogador pelo nome. Dois amigos com o mesmo nome dividem a mesma anotação.

## Testes

| Camada | Caso | Comando |
|--------|------|---------|
| 1 | máquina de estados: convite, aceitar, recusar, ofertas, as duas confirmações e a final, mudar a oferta zera as confirmações (também na final), cancelar em `invited`, `open` e `final`, recusas (longe, ocupado, já em troca, si mesmo), ofertas inválidas, cancelamento por ficar ocupado ou longe | `npx vitest run --project server test/trade.test.ts` |
| 1 | mensagens do protocolo v23 | `npx vitest run --project shared test/game/protocol-v23.test.ts` |
| 2 | proposta e aceite pela sessão, recusa por distância, saída do parceiro, cancelamento | `npx vitest run --project server test/trade-session.test.ts` |
| 2 | troca atômica em memória: sem queda, queda na proposta, na confirmação, na confirmação final e na gravação (volta com e sem token, depois do prazo da reserva), commit recusado; sem perda nem duplicação e com os dois saves coerentes | `npx vitest run --project server test/trade-atomic.test.ts` |
| 2 | livro: queda na gravação, anfitrião fecha, partida seguinte com o save antigo recebe a troca; o `save-ack` esvazia o livro | `npx vitest run --project server test/trade-atomic.test.ts` |
| 1 | arquivo do livro: reabrir, remover, arquivo ausente, anotação inválida, arquivo que não é JSON | `npx vitest run --project app test/trade-ledger.test.ts` |
| 2 | a mesma troca por WebSocket real em localhost, com o socket derrubado em cada fase | `npx vitest run --project app test/trade-ws.test.ts` |
| 4 | Não se aplica neste item: o "Pronto quando" pede os testes da máquina de estados. A tela (`TradePanel.svelte`) ainda não foi capturada no app | — |

## Evolução por troca (028.4)

Depois de aplicar a troca, o servidor confere cada Pokémon recebido contra as evoluções dos dados extraídos:

- método `trade`: a evolução entra na fila de progressão do jogador que recebeu (a mesma fila de nível e pedra, spec 016);
- método `trade-item`: só quando o Pokémon segura o item da condição; aceita a evolução, o item segurado é consumido;
- sem método de troca, nada acontece.

A evolução é oferecida e pode ser recusada como as outras; recusada, a espécie e o item segurado ficam. A fila faz parte do save da troca, então uma queda na gravação não perde a evolução pendente. Sem mudança de protocolo nem de save.

| Camada | Caso | Comando |
|--------|------|---------|
| 1 | `trade`, `trade-item` com e sem o item, outro item, sem evolução, recusa | `npx vitest run --project server test/progression-trade.test.ts` |
| 2 | troca pela sessão com 2 jogadores, evolução aceita chega ao save | mesmo arquivo |
| 3 | dados reais: Kadabra → Alakazam, Onix com Metal Coat → Steelix (item consumido), Onix sem item e Pidgey não evoluem | `npm run golden` (`packages/app/golden/trade.golden.ts`) |
