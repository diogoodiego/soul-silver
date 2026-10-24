# Contrato: arquivo de save

- Local: `%APPDATA%/SoulSilver/saves/slot-{1,2,3}.json` e `slot-N.json.bak`.
- Formato: JSON UTF-8, um objeto `Save` ([data-model.md](../data-model.md)).
- Export/import: o mesmo objeto, extensão `.sssave`.

```json
{
  "schemaVersion": 1,
  "name": "Gold",
  "character": "male",
  "area": "<id do mapa inicial>",
  "x": 120, "y": 88, "facing": "south",
  "playTimeMs": 0,
  "savedAt": "2026-10-24T12:00:00.000Z",
  "rev": 0
}
```

## Carregar

1. Ler e `JSON.parse` → falha = `corrupt("unreadable")`.
2. `schemaVersion` > atual → `save-too-new`; < atual → migrar `n → n+1`.
3. `saveSchema.safeParse` → falha = `corrupt(<campo>: <motivo>)`.

## Gravar (atômico)

1. Validar o save com o schema (nunca grava inválido).
2. Escrever `slot-N.json.tmp-<rand>` e `fsync`.
3. Se existe `slot-N.json` íntegro → rename para `slot-N.json.bak` (substitui o anterior).
4. Rename do tmp → `slot-N.json` (retry em `EPERM`/`EBUSY`/`EACCES`).
5. Qualquer falha → apagar o tmp, manter atual e `.bak`, avisar o jogador.

Um atual corrompido nunca substitui o `.bak`.
