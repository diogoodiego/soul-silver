# Contrato: protocolo v24

`PROTOCOL_VERSION` 23 → 24 (`shared/src/protocol-version.ts`); apps de versões diferentes recusam a conexão. Mensagens em `shared/src/game/protocol.ts`, todas `strictObject`. O save não muda.

Item 028.5 do roadmap: duelo entre dois jogadores, cada um controlando o próprio Pokémon, numa arena como a das lutas de treinador (spec 022). O duelo não dá XP nem dinheiro, e ninguém perde nada.

## Cliente → servidor

| Mensagem | Campos | Regra do servidor |
|----------|--------|-------------------|
| `duel-invite` | `to`, `rules: { level, team }` | `level`: `"current"` (a equipe como está) ou `"50"` (todos no nível 50, com PS cheio); `team`: 1–6, os primeiros da equipe. Recusa com `notice` `trade-far` se o outro está noutro mapa ou a mais de 48 px; `trade-busy` se algum dos dois está em combate, em cena, numa troca ou em outro duelo; `action-refused` para si mesmo ou um id fora da sessão |
| `duel-answer` | `accept` | só o convidado, só enquanto o convite está aberto; recusar cancela |
| `duel-cancel` | — | retira o convite; durante a luta, interrompe o duelo |

## Servidor → cliente

| Mensagem | Conteúdo |
|----------|----------|
| `duelState` | `phase` (`invited`, `waiting`, `fighting`, `ended`), `partner`, `rules`; `arena: { area, x, y, radiusPx }` durante a luta; `result` (`won`, `lost`, `cancelled`, `aborted`) no fim |

## Regras da luta

1. Ao aceitar, o servidor guarda uma cópia do progresso dos dois: equipe, mochila, dinheiro, fila de progressão e Pokédex.
2. A equipe de cada um passa a ser só os primeiros `team` membros. Com `level: "50"`, todos no nível 50 e com PS cheio.
3. A arena fica no ponto médio entre os dois, com o raio das lutas de treinador. Os dois entram em combate com a mesma arena, e os golpes de um só alcançam o Pokémon do outro.
4. Quando o último Pokémon de um jogador desmaia na arena do duelo, ele perde e o outro vence. Não há desmaio geral: ninguém volta ao Pokémon Center, ninguém perde dinheiro.
5. No fim (vitória, derrota ou interrupção por queda ou `duel-cancel`), os dois saem da arena e o progresso volta exatamente à cópia do passo 1. HP, itens usados, amizade, Pokédex, níveis e posição ficam como antes.
6. A XP já só vem de Pokémon selvagens e de treinadores, então o duelo não dá XP. Um save feito durante a luta (o periódico, ou o de quando o anfitrião fecha a partida) grava a cópia do passo 1, nunca o estado do duelo.

## Testes

| Camada | Caso | Comando |
|--------|------|---------|
| 1 | máquina de estados: convite, aceite, vitória e derrota, recusa, cancelamento antes da luta, queda durante a luta, luta que não começa, recusas, retirada do convite | `npx vitest run --project server test/duel.test.ts` |
| 1 | mensagens do protocolo v24 | `npx vitest run --project shared test/game/protocol-v24.test.ts` |
| 2 | duelo pela sessão com 2 jogadores: níveis atuais com time de 1; nivelado a 50 com time de 2 e um save no meio; queda durante a luta; derrota do convidado. Os saves dos dois ficam inalterados (equipe, mochila, dinheiro, Pokédex, fila, posição) | `npx vitest run --project server test/duel-session.test.ts` |
| 4 | Não se aplica neste item: o "Pronto quando" pede o teste de harness. A tela (`DuelPanel.svelte` e a escolha de regras na aba Online) ainda não foi capturada no app | — |
