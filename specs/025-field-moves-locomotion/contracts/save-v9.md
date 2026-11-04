# Contrato: save v9 (sobre v8)

`SAVE_SCHEMA_VERSION` 8 → 9, migração em `shared/save/migrate.ts` com teste.

| Mudança | Detalhe |
|---------|---------|
| remove `badges` | contagem 0–16 |
| adiciona `badgeSet` | int 0..0xFFFF, bit i = insígnia i |
| adiciona `flyPoints` | `string[]` sem repetição |

Migração: `badgeSet = (1 << badges) - 1` (com `badges = 16` → `0xFFFF`); `flyPoints = []` mais a área atual se for ponto de voo. Todo o resto intacto. `badgeCount(set)` (popcount) substitui a leitura da contagem em `companion.ts` e `shop.ts`.

Coerência (`save/coherence.ts`): `flyPoints` sem repetição e só áreas conhecidas.
