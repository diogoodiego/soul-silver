# XP cooperativa (028.6)

Contra um Pokémon selvagem, cada jogador cujo Pokémon participou da luta recebe a XP inteira calculada para ele, como se lutasse sozinho. A XP nunca é dividida entre jogadores: a divisão só acontece entre os Pokémon do próprio jogador que saíram na luta (a regra do original para vários participantes). Um jogador da sessão que não lutou não recebe nada.

A captura continua com quem acertar a bola primeiro: o servidor faz a bola voar e decide (spec 015, `packages/server/src/capture.ts`).

O comportamento já existia desde o spec 016 (`faint` em `packages/server/src/progression.ts`); este item o prende em testes. Sem mudança de protocolo nem de save.

| Camada | Caso | Comando |
|--------|------|---------|
| 1 | 2 e 4 jogadores, com 1 Pokémon cada; 2 Pokémon de um e 1 do outro; 4 jogadores com quantidades diferentes; jogador que não lutou | `npx vitest run --project server test/progression-coop.test.ts` |
| 2 | a captura vai para quem acertou primeiro, a outra bola volta | `npx vitest run --project server test/capture.test.ts` |
