# Contrato: dados de treinador

## Extraídos (estágio `events`, versão 3)

- `trainer-classes.json`: `{ id, prizeBase, music }` por classe (129). Prêmio de `sPrizeMoneyTbl` (overlay 12, 0x34c04); música pela lista de classes do ARM9 (0xFC3CA → 0xFC40A, sequências 1117 treinador, 1118/1127 líder, 1119 rival, 1120 Rocket, 1124 campeão; classe ausente = treinador).
- `trainer-messages.json`: `{ trainer, kind, text }`, de `a/0/5/7` membro 0; o par i é o texto `0728:i`. Tipos: 0 desafio, 1 derrota, 2 depois; 3–5 os mesmos do primeiro treinador de uma dupla.

## `content/trainer/*.json` (escritos à mão, validados com zod no carregamento)

### ai-flags.json
```json
{ "kind": "trainer-ai-flags", "formatVersion": 1,
  "value": { "bits": { "2": { "name": "expert", "combat": "veteran", "switch": { "enabled": true } } } } }
```

### class-profiles.json
```json
{ "kind": "trainer-class-profiles", "formatVersion": 1,
  "value": { "default": { "combat": "rookie", "switch": { "enabled": false, "typeThreshold": 2, "hpThreshold": 0.25, "cooldownS": 8 },
                          "item": { "enabled": true, "hpThreshold": 0.3 } },
             "classes": {} } }
```

### tuning.json
```json
{ "kind": "trainer-tuning", "formatVersion": 1,
  "value": { "arenaRadiusTiles": 6, "sightHz": 5, "activationTiles": 12, "trainerFlagBase": 1360, "alertS": 1,
             "approachSPerTile": 0.25, "challengeTimeoutS": 30, "itemUseS": 1.5, "sendOutS": 1,
             "ballRefusal": ["0197:859", "0197:860"] } }
```

`content/audio/cues.json` ganha `trainerBattle`, `rivalBattle`, `leaderBattle`, `rocketBattle`, `championBattle`, `trainerVictory` (WIN1) e `leaderVictory` (WIN3).
