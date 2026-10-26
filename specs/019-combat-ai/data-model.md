# Modelo de dados: IA de combate dos Pokémon

Tipos em `packages/shared/src/ai`. Unidades: pixels de mundo, ticks a 20 Hz, tiles = 16 px.

## SkillProfile (`content/ai/profiles.json`)

| Campo | Tipo | Significado |
|-------|------|-------------|
| `id` | string kebab | nome do perfil |
| `reactionS` | número ≥ 0 | atraso antes de reagir a um fato novo |
| `aimErrorDeg` | número ≥ 0 | erro angular de mira |
| `leadFactor` | 0–1 | quanto antecipa o movimento do alvo |
| `typeKnowledge` | 0–1 | quanto enxerga efetividade e imunidade |
| `dodgeChance` | 0–1 | chance de esquivar de um golpe em preparação |
| `decisionIntervalS` | número > 0 | intervalo entre decisões de golpe |
| `temperature` | número > 0 | sorteio de golpe (baixo ≈ melhor golpe) |
| `sightTiles`, `sightAngleDeg` | número | alcance e ângulo do cone |
| `hearingTiles` | número | raio máximo de audição |
| `memoryS` | número ≥ 0 | tempo da última posição vista |
| `fleeHpFraction` | 0–1 | limiar de fuga por HP |
| `targetSwitchMargin` | número ≥ 0 | histerese relativa da troca de alvo |
| `source` | `wild` \| `trainer` (opcional) | quem usa; sem efeito no comportamento |
| `aiFlags` | string[] (opcional) | reservado ao mapeamento do spec de treinadores; ignorado |

Validação: faixas acima; ids únicos; `sightAngleDeg` 1–360; erro com arquivo, caminho do campo e problema.

## Temperament (`content/ai/temperaments.json`)

Por temperamento (`passive | skittish | aggressive | territorial`):

| Campo | Significado |
|-------|-------------|
| `onSeePlayer` | `ignore` \| `alert-approach` \| `alert-flee` \| `alert-watch` \| `alert-by-zone` |
| `onHurt` | `flee` \| `fight` \| `weighted` |
| `fightWeight` | 0–1, usado por `weighted` (revide) |
| `fightWhenCornered` | boolean |
| `toleranceTiles` | raio próximo da zona (territorial) |
| `fleeHpFraction` | substitui o do perfil quando presente |
| `chaseLimitTiles` | desiste da perseguição além disso |

O mapa `species → temperament` com `default` continua em `content/wild/temperaments.json` (spec 15).
As transições são escolhidas por esses campos; nenhum temperamento tem código próprio.

## WildLevelTable (`content/ai/wild-levels.json`)

Lista ordenada de `{ minLevel, maxLevel, profile }` sem lacunas nem sobreposição, cobrindo 1–100.
A faixa 1–?? das rotas iniciais aponta para um perfil lento; áreas avançadas, para um melhor.

## AiTuning (`content/ai/tuning.json`)

| Grupo | Campos |
|-------|--------|
| `threat` | `wDamage`, `wProximity`, `wFirst`, `decayPerS` |
| `score` | `immuneScore`, `statusUsefulness`, `buffUsefulness`, `healUsefulness`, `healHpFraction`, `buffEarlyS`, `buffSafeTiles`, `outOfRange`, `speedPenalty`, `hitChance` (por formato de hitbox: `arc`, `circle`, `capsule`, `none`) |
| `noise` | `walkTiles`, `runTiles`, `moveTiles`, `bearingErrorDeg` |
| `perception` | `everyTicks` |
| `performance` | `dormantTiles`, `budgetMsPerTick` (para o teste) |
| `states` | `idleWanderTiles`, `idlePauseS`, `alertS`, `returnIgnoreS`, `repositionS`, `angryAfterEscapeS` (a busca dura o `memoryS` do perfil) |
| `cast` | `aiMinCastS` |
| `debug` | `hz`, `radiusTiles` |

## Estados em memória (não persistidos)

- **AiState**: `idle | alert | approach | combat | reposition | flee | return | incapacitated`.
- **AiMemory**: `{ targets: Map<id, { lastSeen: Point, seenAtTick, velocity }>, heard: { bearing, atTick } | undefined }`.
- **ThreatTable**: `Map<opponentId, number>` + `current: id | undefined`.
- **Controller**: `{ state, stateSinceTick, target, memory, threat, nextPerceptionTick, nextDecisionTick, pendingReaction, lastInput, lastDecision }`.
- **Decision** (também o registro de log): `{ tick, entityId, state, target, move | null, scores: [{ slot, move, damage, hit, utility, score }], chosenSlot, reason }`.
- **AiView**: somente leitura — `self`, `visible: OpponentView[]` (posição, velocidade, tipos, status, hpFraction, casting?), `noises`, `zone: { center, radiusTiles }`, `tick`.
- **Gancho**: `AiHooks { chooseSwitch?(view): undefined; chooseItem?(view): undefined }`, ambos sem efeito.

## Transições entre estados

```text
idle ──vê/ouve──▶ alert ──aggressive/approach──▶ approach ──na distância──▶ combat
  ▲                 │ ──flee──▶ flee ──encurralado──▶ combat
  │                 └ ──watch──▶ idle (observando)
combat ──HP < limiar──▶ flee        combat ──golpe vindo/ajuste──▶ reposition ──▶ combat
combat/approach ──perdeu alvo e memória vence──▶ return
qualquer ──além do raio máximo──▶ return ──na zona──▶ idle
qualquer ──imobilizado/cast travado/flinch──▶ incapacitated ──recuperou──▶ estado anterior
```

Escape de Poké Ball: o servidor chama `controller.enrage(untilTick)`; agressivo vale até lá.
