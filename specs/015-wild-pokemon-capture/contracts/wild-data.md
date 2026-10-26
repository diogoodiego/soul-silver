# Contract: content/wild

Schemas in `packages/shared/src/wild/schemas.ts`, validated at server load
(`packages/server/src/wild-loader.ts`). Same envelope as `content/companion`
(`{ kind, formatVersion: 1, value }`).

## spawn.json (`kind: "wild-spawn"`)

```json
{
  "defaultCap": 6,
  "capByMap": { "<mapId>": 8 },
  "spawnIntervalMinSeconds": 0.5,
  "spawnIntervalSeconds": 4,
  "viewHalfTiles": { "x": 8, "y": 6 },
  "viewMarginTiles": 2,
  "maxTries": 16,
  "despawnRadiusTiles": 24,
  "despawnSeconds": 30,
  "faintedSeconds": 30,
  "leashTiles": 10,
  "shinyOdds": 8192,
  "timeBands": { "morning": 4, "day": 10, "night": 20 },
  "turnSeconds": 5,
  "angryOnEscapeChance": 0.5,
  "storageMax": 30,
  "throwRangeTiles": 6,
  "ballSpeedTilesPerSecond": 12,
  "shakeSeconds": 0.8
}
```

`viewHalfTiles` is half the 256×192 screen. `storageMax` is checked before a throw; the save schema
caps storage at 30 (`STORAGE_MAX`).

## temperaments.json (`kind: "wild-temperaments"`)

```json
{
  "default": "passive",
  "species": { "16": "skittish", "19": "aggressive", "74": "territorial" }
}
```

Values: `passive | skittish | aggressive | territorial`. Species keys are ids 1–493. What each
temperament does lives in `content/ai/temperaments.json` (spec 019); the sight radii moved to the AI profiles.

## balls.json (`kind: "wild-balls"`)

```json
{
  "balls": {
    "1": { "always": true },
    "4": { "mult": 1 },
    "6": { "mult": 3, "when": "types", "types": [11, 6] },
    "13": { "mult": 3.5, "when": "night-or-cave" }
  }
}
```

Keys are item ids from `items` (spec 4), pocket `balls`: 1–16 and 492–500, checked against the
extracted item names. Each ball has `mult`, or `always: true` (Master Ball, Park Ball). `when`
values: `night-or-cave`, `first-turn`, `timer`, `types` (needs `types`, type ids), `nest`, `repeat`,
`level`, `fast`, `moon`; absent = always `mult`. An unknown `when` fails validation. Heavy, Love,
Lure and Dive Balls are plain ×1 for now (`docs/balance-log.md`).
