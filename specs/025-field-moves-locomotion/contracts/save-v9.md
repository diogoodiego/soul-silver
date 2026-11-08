# Contrato: save v9 (sobre v8)

`SAVE_SCHEMA_VERSION` 8 → 9, migração em `shared/save/migrate.ts` com teste.

| Mudança | Detalhe |
|---------|---------|
| remove `badges` | contagem 0–16 |
| adiciona `badgeSet` | int 0..0xFFFF, bit i = insígnia i |
| adiciona `flyPoints` | `string[]` sem repetição |
| adiciona `escape` (opcional) | `{ area, x, y, facing }` ou `null`: o último ponto do jogador num mapa exterior, por onde Dig e Escape Rope saem da caverna. Opcional porque saves v9 anteriores não o têm; ausente vale como `null` (sai no último Centro Pokémon) |

Migração: `badgeSet = (1 << badges) - 1` (com `badges = 16` → `0xFFFF`); `flyPoints = []`; a área atual, se for ponto de voo, entra no primeiro tick da sessão (`packages/server/src/field.ts`), porque a migração não lê dados extraídos. Todo o resto intacto. `badgeCount(set)` (popcount) substitui a leitura da contagem em `companion.ts` e `shop.ts`.

Coerência (`save/coherence.ts`): `flyPoints` sem repetição e só áreas conhecidas.
