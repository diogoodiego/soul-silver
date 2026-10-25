# Research: Pokémon selvagens e captura

## R1. Tabela e horário

- **Decision**: usar `encounters[header.encounters].grass[morning|day|night]` (spec 8). Grama alta e
  chão de caverna usam a mesma tabela "walking", como no original. Horário pela hora local do host:
  manhã 4–9, dia 10–19, noite 20–3. O slot é sorteado por `chance` (soma 100) e o nível uniforme em
  `[minLevel, maxLevel]`.
- **Rationale**: é o dado já extraído e validado; reproduz o original sem mapeamento extra.
- **Alternatives**: sortear pela taxa `rates.walking` (decide frequência de encontro, não espécie;
  vira o intervalo de spawn em dados).

## R2. Zonas e áreas

- **Decision**: zona = células `tallGrass` do mapa; em mapa com `areaType: "cave"`, células `free`.
  Área = um mapa (`area` do mundo). Limite padrão em `spawn.json`, com sobrescrita por mapa.
- **Rationale**: o grid de colisão (spec 6) já tem a categoria; não há categoria "chão de caverna".
- **Alternatives**: marcar zonas à mão (não escala para todas as rotas).

## R3. Fora da visão

- **Decision**: célula aceita se está fora do retângulo de visão de todo jogador da área, expandido
  por `viewMarginTiles`. Até `maxTries` sorteios; sem célula válida, o spawn é adiado.
- **Alternatives**: spawn só quando ninguém está no mapa (área fica vazia quando se chega).

## R4. Despawn

- **Decision**: cada selvagem guarda `lastNearTick`; sem jogador a `despawnRadiusTiles` por
  `despawnSeconds`, é removido. Em captura ou combate não some.

## R5. Shiny

- **Decision**: `rng() < 1/8192` no spawn (chance da Gen 4 sem Shiny Charm). PID/TID não são
  modelados; o resultado é o mesmo em probabilidade.

## R6. Golpes

- **Decision**: últimos 4 golpes distintos do learnset com nível ≤ nível do selvagem, como o
  original faz com selvagens.

## R7. IA

- **Decision**: máquina de estados por selvagem: `wander → flee | chase | return`. Passivo:
  `wander`, `flee` ao sofrer dano. Arisco: `flee` com jogador no `sightTiles`. Agressivo: `chase`
  com jogador no `detectTiles`, ataca com o combate do spec 13. Territorial: `chase` só dentro de
  `territoryTiles` do ponto de spawn. Qualquer estado vira `return` além de `leashTiles` da origem.
  Movimento por passo direto com colisão do mapa; alvo do ataque segue `chaseLimitTiles` do spec 14.
- **Alternatives**: pathfinding A* (caro, sem ganho em rotas abertas).

## R8. Fórmula de captura (Gen 4)

- **Decision**: `a = floor(floor((3·hpMax − 2·hp) · rate · ball) / (3·hpMax)) · status`.
  `a ≥ 255` captura sem sorteio. Senão `b = floor(1048560 / floor(sqrt(floor(sqrt(16711680 / a)))))`,
  4 testes `rand16 < b`; balançadas mostradas = testes passados até a primeira falha (máx. 3), captura
  se os 4 passam. Status: sono/congelado ×2, paralisia/queimadura/veneno ×1,5. Master Ball captura sempre.
- **Rationale**: é a fórmula de referência das Gen 3–4; teste compara com tabela de valores conhecidos.

## R9. Bolas fora de turnos

- **Decision**: o original conta turnos; aqui "turno" = `turnSeconds` (em dados) desde o primeiro
  dano ou arremesso no selvagem. Quick Ball ×4 só antes do primeiro turno; Timer Ball
  `min(4, 1 + turnos·0,3)` (Gen 4: `(turnos + 10)/10`). Dusk ×3,5 à noite ou em caverna; Net ×3
  contra Água/Inseto; Nest `max(1, (40 − nível)/10)`; Repeat ×3 se capturado na Pokédex; bolas
  Apricorn de HGSS (Level, Fast, Moon, Heavy, Love, Friend, Lure) com as regras de HGSS.
- **Shortcut**: Love Ball fica ×1 até o gênero existir (spec 16); Heavy fica ×1 (peso não extraído); Lure e Dive ficam ×1 até surf e
  pesca (spec 22). Anotado em `docs/balance-log.md`.

## R10. Arremesso e disputa

- **Decision**: a bola é um projétil do combate (spec 13) com hitbox pequena e alcance em dados,
  saindo do Pokémon controlado ou do treinador. O primeiro acerto no tick trava o selvagem
  (`capturing`); acertos seguintes do mesmo tick ou depois devolvem a bola. Empate no mesmo tick:
  menor id de jogador.
- **Alternatives**: captura por botão de interação (sem mira, contraria o spec).

## R11. Destino, Pokédex e bolsa

- **Decision**: o save ganha `bag` (só itens com quantidade), `pokedex` (`seen`, `caught` como listas
  de espécie) e `storage` (até `storageMax`). "Visto" é marcado quando o selvagem entra no conjunto
  de relevância do jogador. Novo jogo começa sem bolas; a flag de dev dá 20 Poké Balls.
