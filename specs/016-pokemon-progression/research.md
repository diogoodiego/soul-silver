# Research: Progressão dos Pokémon

## R1 Fórmula de XP

- **Decision**: Gen 4 (HGSS): `exp = floor(floor(floor(b × L / 7) / s) × a)`, onde `b` é a
  `baseExperience` da espécie derrotada, `L` o nível dela, `s` o número de participantes que recebem
  XP e `a` vale 1,5 contra treinador (1 contra selvagem). Cada passo é truncado, como no jogo. O
  bônus de troca (1,5×/1,7×), o Lucky Egg e a Exp. Share ficam de fora (spec).
- **Rationale**: É a fórmula da Gen 4; ela não escala pelo nível de quem recebe (isso só chega na Gen 5).
- **Alternatives considered**: a fórmula escalada da Gen 5, rejeitada pelo princípio I.

## R2 Curvas de crescimento

- **Decision** (revista na implementação): as 6 fórmulas da Gen 3/4 em
  `shared/progression/experience.ts`, como já é feito com `computeStats`. O nível é o maior `n` com
  `expForLevel(n) ≤ exp`. A XP de quem está no nível 100 não aumenta.
- **Rationale**: São ~20 linhas, os testes conferem os valores de referência públicos direto (SC-002)
  e o servidor não precisa carregar `growth-rates.json`. A tabela extraída continua sendo conferida
  pelo relatório de sanidade do extrator.
- **Alternatives considered**: ler `growth-rates.json` (plano original), que pede mais um arquivo
  carregado e só pode ser testado com fixture.

## R2b Natureza

- **Decision**: a natureza é o id 0–24 da Gen 4; o stat que sobe é `floor(id / 5)` e o que desce é
  `id % 5`, na ordem Ataque, Defesa, Velocidade, At. Esp., Def. Esp.; iguais é neutra.
- **Rationale**: É a regra do jogo, igual à de `natures.json`, e dispensa carregar mais um arquivo.

## R3 Participante em tempo real

- **Decision**: Cada servidor guarda, por selvagem e por jogador, o conjunto de índices da equipe
  que estiveram ativos no combate desse jogador enquanto o selvagem estava nele. Quando o selvagem
  cai, recebem XP os índices desse conjunto que não estão desmaiados. Se jogadores diferentes
  lutaram com o mesmo selvagem, cada um recebe a XP inteira para os seus participantes, sem divisão
  entre jogadores.
- **Rationale**: É o "entrou na luta" do original. Não dividir entre jogadores mantém o progresso
  individual (princípio VII) e evita disputa. Vai para `docs/balance-log.md`.
- **Alternatives considered**: dar XP só a quem deu dano, rejeitado porque o original premia quem
  entrou em campo; dividir entre jogadores, rejeitado porque pune quem joga junto.

## R4 Quando creditar e quando resolver

- **Decision**: XP, EVs e a perda de amizade por desmaio são aplicados no instante da queda (assim
  o save nunca perde ganhos). O nível também é recalculado na hora, mas os stats do combatente ativo
  só mudam ao fim do combate. As subidas de nível, os golpes e as evoluções entram na fila. O fim do
  combate é a transição de `mode` de `combat` para `walk` no `companion.ts`. Enquanto a fila não
  está vazia, `startCombat` é recusado para esse jogador.
- **Rationale**: Atende a FR-006/FR-007 sem mudar o combate ativo no meio da luta.
- **Alternatives considered**: recalcular os stats no meio da luta, rejeitado porque mudaria o HP
  e o dano no meio de uma troca de golpes.

## R5 Ordem da fila

- **Decision**: Por membro, na ordem da equipe. Para cada nível de `antigo + 1` até `novo`, entram
  `level-up` (com o ganho de stats) e depois os `learn` do learnset naquele nível. Ao fim dos níveis
  entra um `evolve` se alguma evolução `level` tem `level ≤ novo`. Se a evolução for aceita, entram
  os `learn` da nova espécie no nível atual.
- **Rationale**: É a ordem do original. Pular o nível de evolução ainda evolui uma vez.

## R6 Evolução cancelada

- **Decision**: Quando cancelada, nada é gravado; no próximo nível ganho a checagem de R5 encontra
  a mesma evolução e a oferece de novo. Não existe estado "cancelado" persistido.
- **Rationale**: É o comportamento original e não exige campo novo.

## R7 Amizade

- **Decision**: Subir de nível dá +5, +3 ou +2 (amizade < 100, < 200, ≥ 200). Desmaiar tira 1. Os
  valores ficam entre 0 e 255, e o capturado começa com a `baseFriendship` da espécie, substituindo
  o `CATCH_FRIENDSHIP = 70` de `server/src/capture.ts`.
- **Rationale**: São as tabelas da Gen 4 para os eventos que já existem.

## R8 IVs, natureza e XP dos Pokémon existentes

- **Decision**: O Pokémon capturado sorteia IVs (0–31) e natureza (0–24) na captura, com o RNG
  semeado do servidor (em combate o selvagem ainda usa IV 31 e natureza neutra; ver balance-log). Na migração 3 → 4, quem não tem esses dados recebe IV 31 e natureza Hardy (neutra),
  que é o padrão de `computeStats`, para não alterar os stats de quem já joga. A XP migrada é o
  mínimo do nível na curva medium-fast (`nível³`), porque a migração não conhece as curvas; ao
  carregar, o servidor a sobe ao mínimo da curva real se estiver abaixo. Os EVs começam em 0.
- **Rationale**: A migração precisa ser pura e determinística (princípio VI); para o jogador, nada
  muda.
