# Contract: content/companion/*.json

Same envelope as `content/combat/tuning.json`: `{ kind, formatVersion: 1, value }`. Validated by zod
on load (`packages/shared/src/companion/schemas.ts`), with an error naming the file, the field path
and the problem (principle III). The server host also checks the reaction texts against the extracted
text bank.

## follow.json (`kind: "companion-follow"`)

```json
{
  "distanceTiles": 1,
  "respawnTiles": 3,
  "largeFramePx": 32,
  "largeSpecies": [95],
  "restrictedMaps": []
}
```

- `largeFramePx`: an overworld frame (feature 007) wider or taller than this marks a large Pokémon.
- `largeSpecies`: species that count as large whatever their sprite. Onix (95) is here because its
  extracted frame is 32×32.
- `restrictedMaps`: map header ids where no companion follows.

## reactions.json (`kind: "companion-reactions"`)

```json
{
  "bank": 265,
  "towns": [126, 127],
  "rules": [{ "when": { "place": "cave", "time": "night" }, "emotion": "sleep", "text": 404 }],
  "fallback": { "emotion": "note", "text": 150 }
}
```

- `bank`: the text bank of the follower lines (feature 005). `text` is a record id in that bank.
- `towns`: mapsecs that count as towns. Other outdoor maps count as routes.
- `when` (every field optional): `place` (`town | route | cave | indoor`), `time`
  (`morning | day | night`), `friendshipMin`, `friendshipMax`. The rule with the most conditions
  wins, and the server RNG breaks ties.
- `emotion`: `exclaim | question | note | heart | sweat | angry | sleep`.

## battle-rules.json (`kind: "companion-battle-rules"`)

```json
{
  "combatRadiusTiles": 6,
  "stepForwardTiles": 1,
  "swapAnimSeconds": 0.5,
  "swapCooldownSeconds": 3,
  "chaseLimitTiles": 10,
  "contactTiles": 1,
  "disengageTiles": 8,
  "disengageSeconds": 5,
  "moneyLossBase": [8, 16, 24, 36, 48, 64, 80, 100, 120],
  "pokemonCenters": [69, 81, 158]
}
```

- `moneyLossBase` has exactly 9 entries (0 to 8+ badges).
- `pokemonCenters`: map header ids of the Pokémon Center ground floors. Entering one makes it the
  blackout respawn point. Home (no Center visited yet) is the new-game start position, so it is not
  stored in this data.
- `chaseLimitTiles` is read by the wild AI (spec 15). Nothing reads it yet.
