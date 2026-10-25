# Research: Combate em tempo real

## R1. Onde o combate roda

- **Decision**: no mesmo mundo e tick do servidor (20 Hz). Combatentes são entidades `pokemon`
  (já em `ENTITY_KINDS`); golpes ativos com hitbox persistente (projétil, campo) são entidades
  `projectile`. Não existe "modo batalha" separado.
- **Rationale**: o jogo é em tempo real no mundo; reusa replicação, relevância e gravação (spec 010).
- **Alternatives**: instância de batalha isolada (duplica caminho de código, contra o princípio IV).

## R2. Fórmula de dano

- **Decision**: Gen 4 inteira, com truncamento nas mesmas etapas do original:
  `base = floor(floor(floor(2·L/5 + 2) · P · A / D) / 50)`; depois `×burn(½, físico)`, `+2`,
  `×crit(2)`, `×random(85..100)/100`, `×STAB(1,5)`, `×tipo1`, `×tipo2`, mínimo 1 (exceto
  imunidade = 0). Crítico ignora estágios desfavoráveis ao atacante, como no original.
  Aleatório e crítico usam `createRng` do servidor.
- **Rationale**: SC-001 exige faixas originais; truncamento fiel evita desvios de ±1.
- **Alternatives**: fórmula em ponto flutuante (diverge do original nos limites).

## R3. Tabela de tipos

- **Decision**: ler `type-chart.json` extraído (multiplicador em décimos). Teste usa um fixture
  escrito à mão com a tabela Gen 4 completa (18 ids incluindo `???`) e compara célula a célula
  com a função de efetividade, que recebe a tabela como dado.
- **Rationale**: tabela vem da ROM (princípio I); o fixture independente prova a leitura.
  Foresight/Odor Sleuth ficam para quando esses golpes tiverem efeito próprio.

## R4. Stats do combatente

- **Decision**: fórmula de stats da Gen 4 (base, IV, EV, nível, natureza). A arena usa IV 31,
  EV 0, natureza neutra por padrão, configuráveis.
- **Rationale**: o spec 14 trará o Pokémon do save; até lá a arena precisa de valores fixos e
  reproduzíveis.

## R5. Cooldown a partir de poder e PP

- **Decision**: `cooldownS = clamp(a + b·power/100 + c·(35/pp − 1), min, max)`, com `a, b, c, min,
  max` em `tuning.json`; golpes de status usam `power = statusPower` de `tuning.json`. Mapeamento
  pode fixar `cooldownS`. Valores iniciais sugeridos: `a=0,6 b=1,2 c=0,4 min=0,4 max=8`
  (Tackle ≈ 1,0 s; Flamethrower ≈ 1,9 s; Hyper Beam ≈ 4,1 s). Registrar no balance-log.
- **Rationale**: atende FR-013 com uma fórmula legível e ajustável.

## R6. Escala por Speed

- **Decision**: fator linear no stat de Speed atual (com estágios e paralisia):
  `t = clamp((speed − speedLow)/(speedHigh − speedLow), 0, 1)`; velocidade de movimento entre
  `moveMinPx` e `moveMaxPx` por tick; redução de cooldown entre `0` e `cooldownMaxCut` (ex.: 30%).
- **Rationale**: limites explícitos em dados (FR-014) e sem extremos quebrados em níveis altos.

## R7. Hitboxes

- **Decision**: geometria 2D em pixels de mundo, três formas: `circle` (raio), `capsule`
  (comprimento, largura — feixe, investida, corpo a corpo reto) e `arc` (raio, ângulo — corpo a
  corpo em leque). Combatente tem corpo circular. Teste por sobreposição; projétil é círculo que
  avança por tick com teste de varredura (cápsula do passo) para não atravessar alvos.
  Cada golpe acerta cada alvo no máximo `hits` vezes por uso.
- **Rationale**: suficiente para os 9 arquétipos, determinístico, barato (princípio X).
- **Alternatives**: motor de física (dependência e não determinismo).

## R8. Arquétipos em dados

- **Decision**: um arquétipo é uma combinação nomeada de um `behavior` fixo no código (`melee`,
  `projectile`, `beam`, `self-area`, `target-area`, `dash`, `self-buff`, `target-debuff`, `field`)
  com parâmetros padrão. Novos arquétipos em dados reutilizam um `behavior` com outros padrões;
  um `behavior` novo exige código (limite documentado em FR-003).
  Genéricos: `generic-physical` (melee), `generic-special` (projectile), `generic-status`
  (target-debuff sem efeito, só cooldown).
- **Rationale**: dados controlam tudo que é número e forma; só a semântica de execução é código.

## R9. Tempo e status

- **Decision**: dados em segundos; convertidos para ticks (`round(s·20)`) no carregamento.
  Status: burn (dano 1/8 HP a cada `intervalS`, ataque físico ×½), poison (1/8), toxic (n/16
  crescente por intervalo), paralysis (Speed ×¼, chance de travar o golpe), sleep (duração
  aleatória `minS..maxS`), freeze (chance de descongelar por intervalo, descongela ao levar golpe
  de fogo), confusion (chance de desvio angular `±deviationDeg`). Um status principal por vez;
  imunidades por tipo (fogo/burn, gelo/freeze, veneno e aço/poison, elétrico não é imune na Gen 4).
- **Rationale**: FR-015/016 e regras originais.

## R10. Protocolo

- **Decision**: v5. `input` ganha `aim` (vetor normalizado no mundo, ou nulo) e usa os bits 0–3 de
  `buttons` para golpes 1–4. Servidor manda `combat-event` (acerto, cura, status, falha) para os
  clientes relevantes; HP, status, estágios e cooldowns vão em `data` da entidade `pokemon`.
- **Rationale**: `buttons` já existe; eventos separados garantem números de dano mesmo quando o
  delta de estado é agregado.

## R11. Cobertura do mapeamento

- **Decision**: script `scripts/combat-coverage.ts` lê a extração (encontros das rotas 29–31,
  iniciais e suas evoluções, learnsets por nível, TM/HM, tutor e ovo) e grava
  `content/combat/coverage.json` (lista de ids de golpe). Teste em CI garante que todo id da lista
  tem mapeamento próprio; teste com extração local garante que a lista está atualizada.
- **Rationale**: CI não tem a ROM; ids numéricos não são assets.

## R12. Dono e fogo amigo

- **Decision**: combatente tem `owner` (id do jogador ou `wild`). Hitbox só afeta alvos com dono
  diferente e `canHarm(a, b)`: falso entre dois jogadores enquanto não houver PvP (spec 25);
  verdadeiro contra `wild`. Na arena, o segundo Pokémon é `wild` ou de um jogador com arena PvP
  habilitada.

## R13. Arena de desenvolvimento

- **Decision**: ativada só com `import.meta.env.DEV` no cliente e flag `devArena` na sessão solo
  do servidor; abre num mapa vazio. HUD Svelte escolhe espécie, nível e 4 golpes para cada lado
  e mostra HP, cooldowns e status. Builds de produção não incluem a entrada de menu.

## R14. Animações de golpes da ROM (refinamento)

- **Decision**: partículas dos golpes e status vêm da ROM. `a/0/2/9` são os 486 arquivos SPA
  (texturas e emissores), `a/0/1/0` os scripts de animação por golpe, `a/0/6/1` os efeitos de
  batalha (status). Do script só se leem `51 slot spa 1` (carrega SPA) e `46 slot emissor modo`
  (cria emissor); o modo diz onde ele nasce: 3 no atacante, 4 no alvo, 17 do atacante ao alvo.
  O cliente aproxima os emissores (cor, escala, vida, gravidade), sem câmera, fundo nem filhos.
- **Dúvida técnica em aberto**: 48 golpes (ex.: Tail Whip 39, Double Team 104) não criam
  partículas; a animação original deles move o sprite do Pokémon, mexe no fundo ou usa sprites 2D
  de outros arquivos. Falta decodificar esses comandos do script e extrair esses gráficos. Até
  lá, o usuário do golpe pisca por 400 ms. Os modos raros 0, 19, 20 e 60 ficam tratados como
  "no atacante" até serem conferidos.
