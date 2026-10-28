# Research: Batalhas contra treinadores

## R1. Alcance de visão
- **Decision**: `param[0]` do objeto de evento (`eyeRange` no `ObjectEvent` do pokeheartgold), em tiles, na direção `facing`. Treinador é o objeto com `trainer != null`. Linha de visão por `shared/ai/sight.ts` sobre a grade de colisão.
- **Rationale**: dado já extraído; nenhum campo novo no extrator.
- **Alternatives**: `xRange`/`yRange` (são do movimento aleatório, não visão).
- **Confirmado**: `param[0]` vale 0–7 nos 404 objetos treinador da extração; no app, Joey (Route 30) e Abe (Ginásio de Violet) avistam na distância esperada.

## R2. Fluxo único (avistamento e script)
- **Decision**: avistamento chama o mesmo `startTrainerBattle(player, trainerId, npcId)` que o bridge `TrainerBattle`. Avistamento roda o script do treinador (fala de desafio) antes; script já tem as falas.
- **Alternatives**: dois caminhos — rejeitado (divergência de regras).

## R3. Derrotado
- **Decision** (confirmado: `TRAINER_FLAG_BASE 0x550` em pret/pokeheartgold `constants/flags.h`): flag do original `TRAINER_FLAG_BASE + trainerId` nas flags do jogador (o save já guarda flags por jogador). Sem migração.
- **Alternatives**: lista nova no save — exigiria schema 7 sem ganho.

## R4. Prêmio
- **Decision**: `prize = prizeBase(classe) × nível do último Pokémon do time × 4`, ×2 em batalha dupla (confirmado em `CalcPrizeMoney`, pret/pokeheartgold `battle_command.c`). A tabela `sPrizeMoneyTbl` fica no overlay 12 em 0x34c04. No app: Joey paga ¥64 e Falkner ¥1.560.
- **Alternatives**: valor fixo por classe — infiel.

## R5. Perfil de IA
- **Decision**: cada bit conhecido de `aiFlags` mapeia em `content/trainer/ai-flags.json` para ajustes de perfil (base de spec 019 + `switch` e `item`). Combina por precedência do bit mais alto. `aiFlags == 0` → `class-profiles.json[classId]` ou `default`.
- Bits relevantes: Basic, Evaluate Attack, Expert, Setup, Risky, Prefer Strong, Prefer Baton Pass, Check HP, Weather, Harassment.

## R6. Troca e itens
- **Decision**: funções puras em `shared/trainer/decide.ts` lidas pelos hooks existentes `AiHooks.chooseSwitch/chooseItem`.
  - Troca: se `switch.enabled` e (efetividade do melhor golpe do oponente sobre o ativo ≥ `typeThreshold` ou HP < `hpThreshold`) e há reserva com efetividade menor; cooldown `switchCooldownS`. Retorna índice no time.
  - Item: se HP < `item.hpThreshold` e restam itens de cura; uso consome o mesmo tempo do jogador (`items.ts`). Cada item uma vez.
- **Alternatives**: árvore no controlador — rejeitado (spec 019 já reservou os hooks).

## R7. Arena e isolamento multiplayer
- **Decision**: arena = círculo centrado no ponto médio jogador–treinador, raio `arenaRadiusTiles`. Combatentes ganham `battleId`; `combat` só aplica acerto se ambos têm o mesmo `battleId` (ou nenhum). Corpos fora da batalha não colidem com os de dentro. Companheiro usa o raio da arena enquanto houver batalha.
- **Estado do NPC por jogador**: o NPC não se move no mundo compartilhado durante a aproximação; a caminhada é uma cena do cliente de quem foi avistado (princípio VII, como cutscenes). Os outros veem o jogador "ocupado".

## R8. Duplas
- **Decision**: `doubleBattle` → dois primeiros Pokémon adversários entram; o segundo Pokémon vivo do jogador entra com o controlador de IA de combate como aliado (time = jogador). Gêmeos são um treinador com `doubleBattle` no original.

## R9. Captura e fuga
- **Decision**: `capture.ts` recusa bola se o alvo tem `battleId` de treinador, com o texto original (`msg` do arquivo de textos de batalha extraído). Fuga: ação de fugir/sair da arena é ignorada; jogador fica contido na arena.

## R10. Música
- **Decision**: `cues.json` ganha `trainerBattle`, `rivalBattle`, `leaderBattle`; extrator associa por classe (rival e líderes por id de classe). `desiredMusic` recebe o tipo.

## R11. Falas e espera do desafio
- **Decision**: falas do banco 728 indexadas por `a/0/5/7` (tipos 0/1/2 e 3–5 em duplas). A batalha espera o cliente fechar a fala de desafio (`trainer-ready`), no máximo `challengeTimeoutS`, como no original; antes, a luta começava com a caixa de diálogo aberta e o jogador sem controle.
- **Conversa**: treinador não derrotado desafia ao ser abordado (sem caminhada); derrotado diz a fala tipo 2.
