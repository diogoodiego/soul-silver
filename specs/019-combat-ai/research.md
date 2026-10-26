# Pesquisa: IA de combate dos Pokémon

Nenhum item ficou como NEEDS CLARIFICATION. Decisões tomadas a partir do código atual.

## R1. Onde a IA entra: input, não combate

- **Decisão**: o controlador devolve um `CombatInput { move, buttons, aim }` por tick e o servidor o
  entrega a `combat.input(id, …)`, como o `drive` do spec 15 já faz.
- **Racional**: garante FR-001 por construção: cooldown, conjuração (`castTicks`), status e
  movimento são aplicados por `combat.ts`, o mesmo caminho do jogador. Nenhum dano ou movimento
  passa pela IA.
- **Alternativas**: IA dentro do combate (rejeitada: duplica regras e acopla); IA que chama
  `execute` direto (rejeitada: quebra "nenhum golpe sai sem aviso").

## R2. Preparação visível garantida

- **Decisão**: todo golpe em `combat.ts` com `castS` > 0 entra em `casting` antes de executar, e o
  cliente já desenha a preparação. A IA apenas aperta o botão. Os arquétipos sem `castS` receberão
  um mínimo `aiMinCastS` em `content/ai/tuning.json`, aplicado ao botão da IA, que mantém o golpe em
  `casting` por esse tempo mínimo.
- **Racional**: FR-026 é testado inspecionando que `casting` precede todo `used` de uma IA.
- **Alternativas**: alterar `castS` dos golpes (rejeitada: muda o jogador). **Risco**: se
  `combat.ts` não tiver gancho para o mínimo da IA, a tarefa mínima é um parâmetro opcional
  `minCastTicks` em `CombatInput`, sem efeito para jogadores.

## R3. Informação permitida (`AiView`)

- **Decisão**: o servidor cria, por IA, um objeto só de leitura com: o próprio combatente completo;
  para cada adversário *visível* (cone + linha de visão) posição, velocidade, tipos, status, HP em
  fração e casting em curso; eventos de ruído ouvidos. Nunca expõe `readyAt` de outros nem posição
  de quem a memória não tem.
- **Racional**: FR-002; a barreira é de tipo, não de disciplina. Testes de tipo e de comportamento
  (alvo atrás da parede não aparece na view).
- **Alternativas**: passar `Combatant` inteiro (rejeitada: vaza cooldowns).

## R4. Linha de visão

- **Decisão**: `sight.ts` trata a grade de colisão como bloqueio para `blocked` e `ledge`; `water` e
  `tallGrass` não bloqueiam. Percorre as células por DDA (Amanatides-Woo) de A até B, em O(distância
  em células), usando `tileAt(lookup, area, level, x, y)`. O cone é teste de ângulo + alcance.
- **Racional**: já existe `tileAt` e `WorldLookup`; sem dependência nova. "Árvore" no mapa é `blocked`.
- **Alternativas**: raycast contínuo (rejeitada: sem ganho com grade de 16 px).

## R5. Audição

- **Decisão**: o combate/servidor registra *eventos de ruído* `{x, y, radiusPx, tick, sourceId}`
  quando uma entidade corre (`dashing`/correndo) ou executa um golpe; raios em `tuning.json`
  (`noise.walkTiles < noise.runTiles < noise.moveTiles`). A IA ouve se a distância ≤ min(ruído,
  `hearingTiles` do perfil) e passa a olhar na direção do som com erro angular aleatório
  (`noise.bearingErrorDeg`); não grava posição na memória.
- **Racional**: FR-006 sem localização exata.

## R6. Máquina de estados

- **Decisão**: função pura `step(state, view, profile, temperament, rng) → {state, input, debug}`,
  com a tabela de transições em `temperaments.json` (condições nomeadas, não código por temperamento).
  Os 8 estados e `Incapacitado` por leitura de `major.immobile`, `casting` travado e flinch.
- **Racional**: temperamentos como dados (III); novos temperamentos sem tocar em código.
- **Alternativas**: behavior trees (rejeitada: YAGNI, 8 estados bastam).
- **Compatibilidade**: `AiState` do spec 15 (`wander/flee/chase/return`) mapeia para
  Ocioso/Fuga/Aproximação+Combate/Retorno; o `alert` de entidade passa a valer no estado Alerta.

## R7. Ameaça e histerese

- **Decisão**: `threat[i] = wDamage·dano_recebido_de_i + wProximity·(1 − dist/visão) + wFirst·(i atacou
  primeiro)`, com decaimento por segundo. Troca de alvo só se `threat[j] > threat[atual]·(1 + margem)`.
  Desempate pelo menor `entityId` (determinístico, sem sorteio).
- **Racional**: FR-017/FR-018, SC-009; pesos e margem em `tuning.json`/perfil.

## R8. Pontuação e escolha de golpe

- **Decisão**: `score = dano_esperado · chance_de_acertar · pesoDeAlvo + utilidade`. Dano esperado usa
  `computeDamage` (shared/combat) com valores médios (random 92, sem crit) e a efetividade
  `effectiveness()` já existente; imunidade → pontuação `immuneScore`; conhecimento de tipos do
  perfil (`typeKnowledge` 0–1) escala o quanto a IA enxerga a efetividade (0 = trata como neutra).
  Chance de acertar: função do formato do hitbox do arquétipo, da distância ao alcance e da velocidade
  do alvo. Sorteio ponderado por `softmax(score/temperature)`; temperatura baixa ≈ argmax.
- **Racional**: FR-019 a FR-021, SC-001 testável com fixtures (Ember vs. planta).
- **Alternativas**: argmax puro (rejeitada: previsível e sem dificuldade variável).

## R9. Mira, reação e esquiva

- **Decisão**: a IA só reage a um fato (alvo novo, golpe em preparação do adversário) após
  `reactionS`, guardando o fato com o tick de visibilidade. Mira = direção ao alvo + erro angular
  gaussiano-aproximado (`aimErrorDeg`, soma de 2 uniformes); com `leadFactor` > 0, antecipa a posição
  pelo vetor de velocidade observado nas últimas leituras. Esquiva: ao ver `casting` de um golpe com
  área que a alcançará, rola `dodgeChance`; se passar, anda perpendicularmente (Reposicionamento) ou
  usa o dash do combate quando o perfil permitir.
- **Racional**: FR-024/FR-025 só com informação visível.

## R10. Escalonamento, dormência e orçamento

- **Decisão**: IA dorme se nenhum jogador (entidade `player`) da área está a ≤ `dormantTiles`
  (`tuning.json`); ao dormir, não percebe, não decide e não anda (fica parada), sem afetar
  despawn do spawner. Percepção a cada `perceptionEveryTicks` (4) e decisão a cada
  `decisionIntervalS` do perfil; fase inicial = `entityId % período`. Movimento/aim/botão se repete
  do último input entre decisões (o combate consome input por tick).
- **Racional**: FR-031/FR-032, SC-007.
- **Orçamento**: teste `ai-perf` com 30 IAs e 4 jogadores falha se média > 2 ms/tick.

## R11. Determinismo e reprodução

- **Decisão**: todo sorteio usa o `Rng` do servidor, na ordem das IAs por `entityId` crescente; a
  IA não usa `Date`, `Math.random` nem iteração de `Map` sem ordem. Reprodução: o teste existente
  de `replay` compara também o `decisionLog` (JSONL em memória) de duas execuções.
- **Racional**: FR-004, SC-008; segue o padrão de `determinism.test.ts`.

## R12. Depuração

- **Decisão**: protocolo 11 acrescenta `debugAi` (cliente→servidor: liga/desliga) e `aiDebug`
  (servidor→cliente, 4 Hz, só para quem ligou, só IAs na área e a ≤ 20 tiles): estado, alvo,
  direção/alcance/ângulo da visão, última posição lembrada, raio da zona e as pontuações da última
  decisão. O cliente desenha em `ai-overlay.ts` com o atalho do painel de debug já existente. O log
  de decisões é JSONL no servidor, ligado por opção do host (`aiLog`), desligado por padrão.
- **Racional**: FR-033/FR-034; custo zero para quem não liga.

## R13. Calibração para "≥ 90% de vitória"

- **Decisão**: o teste das 100 lutas usa um bot de referência de teste (`test/ai-bot.ts`: mira no
  mais próximo, usa o golpe de maior poder pronto, desvia de golpes em preparação 50% das vezes),
  semente fixa por luta e selvagens da tabela diurna da Route 29 como fixture. Os parâmetros dos
  perfis iniciais ficam em `profiles.json` e os desvios no balance-log.
- **Racional**: SC-006 reprodutível; se falhar, ajusta dado, não código.

## R14. Reuso pelos treinadores

- **Decisão**: `controller.ts` exporta `createController(profile, temperament, hooks)` com
  `hooks.chooseSwitch?` e `hooks.chooseItem?` (retornam `undefined` por padrão). O perfil
  tem o campo opcional `source` (`"wild" | "trainer"`) e `aiFlags?: string[]` reservado e ignorado
  nesta etapa. `sight.ts` não importa nada de `combat`.
- **Racional**: FR-008, FR-029, FR-030.
