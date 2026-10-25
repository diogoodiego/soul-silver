# Contrato: dados de combate (`content/combat/`)

Arquivos JSON escritos à mão, com o envelope dos dados de jogo:
`{ "kind": "<nome>", "formatVersion": 1, "records": [...] }`. `tuning.json` usa `"value"` no lugar de
`records`, e `coverage.json` usa `"moves"`. Schemas em `packages/shared/src/combat/schemas.ts`.
O servidor junta esses arquivos com a extração em `buildCombatData` (`packages/server/src/combat-loader.ts`).
Qualquer erro interrompe a carga com `content/combat/<arquivo>: <caminho do campo>: <problema>`. Exemplo:
`content/combat/moves.json: records.12.hitbox.radiusPx: esperado valor ≥ 0`.
Sem dados válidos, o servidor roda sem combate e registra o motivo no log.

Os arquivos vão embutidos no app no build. Editar exige reiniciar o `npm run dev` ou refazer o build.

## Arquivos

| Arquivo | `kind` | Registro |
|---------|--------|----------|
| `archetypes.json` | `archetypes` | `{ id, behavior, defaults: MoveParams }` |
| `moves.json` | `combat-moves` | `{ id: <id do golpe>, archetype, ...MoveParams, effects: Effect[] }`; ids crescentes |
| `statuses.json` | `statuses` | ver [data-model.md](../data-model.md) |
| `tuning.json` | `combat-tuning` | `cooldown`, `speed`, `critChances`, `knockbackPx`, `flashS`, `bodyRadiusPx`, `accuracyDeviationDeg` |
| `coverage.json` | `combat-coverage` | `{ source, moves: id[] }`, gerado por `node scripts/combat-coverage.ts <stages>` |

`MoveParams`: `rangePx`, `hitbox`, `castS`, `cooldownS`, `speedPx`, `hits`, `durationS`, `rooted`, `critStage`.

`Effect` (por `kind`): `damage` (`power`, `fixed`, `level`, `targetHpFraction` opcionais), `status`,
`stages` (`target: self|target`, `stat`, `delta`), `heal`, `recoil`, `drain`, `flinch`, `knockback`,
`weather` (`sun|rain|hail`), `reset-stages`. `chance` omitida usa a chance original do efeito do golpe
(100 quando ela é 0).

Validações cruzadas:
- o `id` do golpe existe na extração;
- o `archetype` existe;
- o formato da `hitbox` serve ao `behavior`;
- os arquétipos `generic-physical`, `generic-special` e `generic-status` existem;
- os 7 status estão presentes.

## Exemplos

```json
{ "id": "projectile", "behavior": "projectile",
  "defaults": { "rangePx": 160, "hitbox": { "shape": "circle", "radiusPx": 6 }, "speedPx": 240, "castS": 0.15, "hits": 1 } }
{ "id": 52, "archetype": "projectile", "effects": [ { "kind": "damage" }, { "kind": "status", "status": "burn" } ] }
{ "id": 14, "archetype": "self-buff", "effects": [ { "kind": "stages", "target": "self", "stat": "attack", "delta": 2 } ] }
{ "id": "burn", "major": true, "durationS": { "min": 8, "max": 8 }, "intervalS": 2, "tickDamage": 0.125, "attackMul": 0.5, "immuneTypes": [10] }
```

Uma mudança incompatível de formato sobe `formatVersion`.
