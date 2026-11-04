# Research: Golpes de campo e locomoção

## R1. Onde estão as insígnias, os pontos de voo e a escuridão (T001, resolvido)

Fonte: pret/pokeheartgold (clone raso fora do repositório): `src/field_move.c`, `include/constants/badge.h`, `include/map_header.h`, `include/constants/flypoints.h`, `src/application/pokegear/map/overlay_101_021F79B4.c`.

- **As insígnias não estão numa tabela de dados.** Cada `FieldMove_Check*` testa a insígnia direto no código: Rock Smash = Zephyr (0), Cut = Hive (1), Strength = Plain (2), Surf = Fog (3), Fly = Storm (4), Whirlpool = Glacier (6), Waterfall = Rising (7), Rock Climb = Earth (15). **Flash, Headbutt, Dig e Teleport não exigem insígnia.** Há restrições além da insígnia: Fly exige `flyAllowed` no cabeçalho, sem seguidor e sem fantasia da Rocket; Flash exige o objeto/flag `FIELD_MOVE_CHECK_FLASH`; Teleport exige `flyAllowed` e mapa que não seja cidade; Dig/Escape Rope exigem `escapeRopeAllowed`.
- **Decisão (muda o plano):** `badgeFor` e as demais condições ficam em `content/field/moves.json`, escrito à mão com a origem citada (arquivo e símbolo da decomp), e não num `field-moves.json` extraído. É a única fonte que existe para FR-002 ("dados originais"); o valor é conferido contra a decomp, não lido da ROM. O extrator deixa de ler insígnias.
- **Escuridão:** o cabeçalho de mapa guarda `weather`; `WEATHER_FLASH = 11` (e `12`) marca caverna escura, e a flag de sistema de Flash desliga esse clima. `map-headers.json` já traz `weather` e `areaType` (`indoor|outdoor|cave`), então não há nada novo a extrair para Flash nem para "bicicleta proibida em interior" (usa `areaType`; o bit `bikeAllowed` do cabeçalho só entra se `areaType` não bastar).
- **Pontos de voo:** `FLYPOINT_*` (0 a 37) são bits de flag do save; a tabela mapa → flypoint → posição no mapa do Pokégear está no overlay 101. O tile de pouso vem de warps por cidade. **Único dado novo da extração (T011–T012):** ler essa tabela do overlay 101 e o warp de pouso de cada cidade; os offsets ainda não foram descobertos.
- **Alternativas descartadas:** ler a insígnia dos scripts (não cobre o menu); fixar sem citar a origem (viola I).

## R2. Obstáculo removido só para quem removeu

- **Decisão**: o servidor guarda `removedObstacles: Set<objectId>` por sessão, associado ao mapa atual, zerado na troca de mapa. Colisão e visibilidade enviadas ao cliente descontam esse conjunto. Não entra no save.
- **Racional**: o original recoloca árvores e rochas ao reentrar no mapa; é o mesmo comportamento sem persistência (VII, sem vazamento). Reusa o filtro de visibilidade por flags do jogador.
- **Alternativas**: flag de save por obstáculo (não reaparece, diverge do original); remoção global (viola VII).

## R3. Insígnias como conjunto

- **Decisão**: save v9 troca `badges` (contagem 0–16) por `badgeSet` (máscara de 16 bits). Migração liga os N primeiros bits. `badgeCount()` serve a loja e a perda de dinheiro. `hasBadge(b)` passa a testar o bit.
- **Racional**: `scripts.ts` já marca isso como atalho (`b < badges`); Cut exige Hive, Surf exige Fog, e a ordem real dos jogadores pode variar com os comandos de dev.
- **Alternativas**: manter a contagem (errado para Fly/Whirlpool fora de ordem).

## R4. Pesca

- **Decisão**: máquina de estados no servidor. Tempo de espera e janela de reação sorteados com `Rng` da sessão; chance de fisgar `base(vara) + k·amizade/255`, parâmetros em `content/field/fishing.json`. O sorteio da espécie usa a tabela da vara do mapa (`oldRod|goodRod|superRod`), incluindo `nightFish` e `swarm` quando houver.
- **Racional**: o original rola "fisgou?" por turno de espera; em tempo real vira janela de reação. Desvio registrado em `docs/balance-log.md`.
- **Teste**: 1.000 pescas por vara com semente fixa, χ² ou margem de 3σ por espécie; monotonia da chance com a amizade.

## R5. Classe de locomoção

- **Decisão**: `content/species/locomotion.json`, mapa `speciesId → "terrestrial"|"aquatic"|"flying"|"levitating"`, escrito à mão a partir do tipo/habilidade (Flying e Levitate viram voador/levitante; tipo Water ou Surf-natural viram aquático; resto terrestre) com revisão manual, e teste de cobertura das 493.
- **Racional**: o spec pede dados, não código; a classe também alimenta o combate depois.
- **Alternativas**: derivar em tempo de execução do tipo (esconde exceções como Gyarados, Lugia, Bronzong).

## R6. Surf e lançamento

- **Decisão**: `launchAllowed(class, mode)` puro; no modo `surf` aceita `aquatic|flying|levitating`. O servidor recusa o lançamento e informa o motivo; o seletor recebe `launchable: boolean[]` da equipe.
- **Racional**: regra única no servidor (IV); o cliente só destaca.

## R7. Flash e visão reduzida

- **Decisão**: atributo `dark` por mapa (extraído) e estado `lit` por jogador; o cliente reduz o raio de visão com `dark && !lit`. Nada no tick.
- **Racional**: é visual; o servidor só decide o estado e o replica ao próprio jogador.

## R9. Onde o servidor decide colisão, visibilidade e recolhimento (T002)

`graphify`: o estado por sessão (`Player`) fica em `packages/server/src/session.ts`; o filtro de visibilidade por flags do jogador é coberto por `new-game-visibility.test.ts`; o recolhimento do companheiro está em `packages/server/src/companion.ts` (comentário "Recall", linha ~196, e o botão `recall` na linha ~343), a reusar no surf e na bicicleta. `map-headers.json` expõe `areaType` e `weather`, suficientes para interior e escuridão.

## R8. Comandos de desenvolvimento

- **Decisão**: reusar o gate `devTools` + depurador ligado do spec 024. O teleporte é o `debugWarp` existente; entram `debugGiveBadge`, `debugTeachMove` e `debugGiveItem`. Fora do gate, nada muda e o log registra.
- **Racional**: a sonda e as capturas precisam preparar estado sem jogar a história; o IPC do Electron não participa (IX).
