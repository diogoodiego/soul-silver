# Research: Pokémon companheiro e regras do combate no mundo

## R1. Seguimento por rastro

- **Decision**: o servidor grava numa fila cada mudança de tile do treinador
  (`{area, x, y, facing, step: walk | hop | warp}`). O companheiro fica `distanceTiles` entradas
  atrás e anda até a próxima posição na velocidade do treinador; `hop` replica o pulo, `warp`
  teleporta depois que o treinador chega. Sem entrada nova, o companheiro para. Distância maior que
  `respawnTiles`, ou área diferente sem warp pendente, faz ele reaparecer no tile atrás do treinador.
- **Rationale**: só visita tiles que o treinador ocupou, então nunca atravessa obstáculo nem fica
  preso; custo O(1) por tick.
- **Alternatives**: pathfinding A* (caro e diverge do original); seguir a posição atual (corta
  cantos e atravessa paredes).

## R2. Companheiro como entidade

- **Decision**: reusar o `EntityKind` `pokemon` com `data.owner`, `data.role = "companion"` e
  `data.state`; sem colisão com jogadores nem com outros companheiros. Replicação e relevância
  seguem o caminho atual.
- **Alternatives**: novo `EntityKind` (muda o protocolo sem ganho).

## R3. Equipe e save

- **Decision**: o save v1 não tem equipe. O v2 adiciona `party` (espécie, nível, golpes, HP,
  amizade; até 6), `money`, `badges` e `respawn`. A migração 1 → 2 cria equipe vazia, dinheiro
  3000 (valor inicial do HGSS), 0 insígnias e `respawn: null`. Até existir o evento do inicial,
  a equipe de teste vem da flag de dev já existente.
- **Rationale**: blackout e perda de dinheiro precisam desses campos; é o mínimo, estendido pelo
  spec 16.

## R4. Pokémon grande

- **Decision**: grande = frame do sprite de overworld (spec 7) maior que `largeFramePx` (32 px)
  em largura ou altura. Calculado por espécie ao carregar a atlas.
- **Alternatives**: lista à mão por espécie (493 entradas para manter).

## R5. Prédio e locais restritos

- **Decision**: prédio = `areaType: "indoor"` do cabeçalho de mapa (spec 6). Locais restritos são
  ids de cabeçalho listados em `follow.json`.

## R6. Tipo de lugar e horário

- **Decision**: `cave` e `indoor` vêm do `areaType`; cidade vs rota pela lista `towns` (mapsec)
  em `reactions.json`, com rota como padrão. Horário pelo relógio local do host, nas faixas da
  Gen 4 (manhã 04–09, dia 10–19, noite 20–03), como o RTC do DS. Amizade do membro da equipe.
- **Rationale**: ainda não há relógio de jogo; o original usa o relógio real.

## R7. Textos das reações

- **Decision**: regras apontam `{bank, index}` do catálogo do spec 5 (banco das falas do Pokémon
  que segue). Vence a regra que combina com mais condições; empate decidido pelo RNG do servidor.
  Sem regra que combine, usa o `fallback`, obrigatório no schema.

## R8. Modo combate

- **Decision**: estado por jogador `walk | combat`. O botão de combate põe o companheiro
  `stepForwardTiles` à frente do treinador (ou o cria ali se estava na bola), e no tick seguinte o
  input passa a mover a entidade do Pokémon: ≤ 100 ms de servidor + RTT. O treinador fica sem
  input, marcado `data.inCombat` e ignorado pelas hitboxes. A posição do Pokémon é projetada no
  círculo de `combatRadiusTiles` em volta do treinador a cada tick.
- **Fim do combate**: recolher, blackout, ou nenhum inimigo ativo a `disengageTiles` por
  `disengageSeconds`. A distribuição de XP do spec 16 entra nesse ponto.

## R9. Troca, desmaio e perseguição

- **Decision**: a troca cria o novo Pokémon vulnerável por `swapAnimSeconds` e inicia o cooldown
  `swapCooldownSeconds`; a equipe não reordena (o índice ativo fica no estado de combate).
  Desmaio: a entidade sai, o cliente abre o seletor; recolher é fugir. `chaseLimitTiles` fica
  publicado para a IA do spec 15; hoje os selvagens não perseguem.

## R10. Perda de dinheiro

- **Decision**: `perda = min(dinheiro, maiorNível × base[min(insígnias, 8)])`, com base
  `[8, 16, 24, 36, 48, 64, 80, 100, 120]` em `battle-rules.json`. Regra de DPPt/HGSS. O
  blackout também cura a equipe, como no original.

## R11. Câmera e input

- **Decision**: a câmera segue a entidade em `controlledId` (enviado no `welcome` e no `state`).
  As novas ações entram no mapa de input remapeável existente; padrão no gamepad: combate = LB,
  recolher = B, interagir = Y, seletor = RB.
