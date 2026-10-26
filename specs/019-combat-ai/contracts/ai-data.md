# Contrato: content/ai

Schemas em `packages/shared/src/ai/schemas.ts`, validados no carregamento do servidor
(`packages/server/src/ai-loader.ts`). Mesmo envelope de `content/wild`
(`{ kind, formatVersion: 1, value }`). Erro de validação cita arquivo, caminho do campo e problema.
Campos de tempo em segundos, distâncias em tiles; o código converte para ticks e pixels.

## profiles.json (`kind: "ai-profiles"`)

```json
{
  "profiles": [
    {
      "id": "novice",
      "reactionS": 0.6,
      "aimErrorDeg": 25,
      "leadFactor": 0,
      "typeKnowledge": 0.2,
      "dodgeChance": 0.05,
      "decisionIntervalS": 1.2,
      "temperature": 1.5,
      "sightTiles": 5,
      "sightAngleDeg": 110,
      "hearingTiles": 6,
      "memoryS": 3,
      "fleeHpFraction": 0.2,
      "targetSwitchMargin": 0.5
    }
  ]
}
```

Perfis iniciais: `novice`, `rookie`, `skilled`, `veteran` (selvagens); outros ficam para os treinadores.
`source` e `aiFlags` são opcionais e ignorados.

## temperaments.json (`kind: "ai-temperaments"`)

```json
{
  "passive": { "onSeePlayer": "ignore", "onHurt": "weighted", "fightWeight": 0.4, "fightWhenCornered": true, "chaseLimitTiles": 8 },
  "skittish": { "onSeePlayer": "alert-flee", "onHurt": "flee", "fightWhenCornered": true, "chaseLimitTiles": 8 },
  "aggressive": { "onSeePlayer": "alert-approach", "onHurt": "fight", "fightWhenCornered": true, "fleeHpFraction": 0, "chaseLimitTiles": 10 },
  "territorial": { "onSeePlayer": "alert-by-zone", "onHurt": "fight", "toleranceTiles": 3, "fightWhenCornered": true, "fleeHpFraction": 0, "chaseLimitTiles": 6 }
}
```

O que cada temperamento faz. Qual espécie tem qual temperamento continua em
`content/wild/temperaments.json` (spec 15), sem os `radii`, que foram removidos: a visão agora vem
dos perfis. Os quatro temperamentos são obrigatórios.

## wild-levels.json (`kind: "ai-wild-levels"`)

```json
{ "bands": [ { "minLevel": 1, "maxLevel": 10, "profile": "novice" }, { "minLevel": 11, "maxLevel": 100, "profile": "rookie" } ] }
```

Faixas contíguas cobrindo 1–100; `profile` deve existir em `profiles.json`.

## tuning.json (`kind: "ai-tuning"`)

Grupos `threat`, `score`, `noise`, `perception`, `performance`, `states`, `cast`, `debug`
(campos em `data-model.md`). Todos obrigatórios; sem valores padrão no código. O raio máximo da
zona é o `leashTiles` de `content/wild/spawn.json`.
