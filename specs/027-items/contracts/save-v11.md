# Contrato: save v11

`SAVE_SCHEMA_VERSION` 10 → 11 (`shared/src/save/schema.ts`). Migração em `migrate.ts`, ao lado da `9:`:

```text
10: (save) => ({ ...save, ...newItemState(), schemaVersion: 11 })
```

Campos novos no save (`itemState`, por jogador, princípio VII):

| Campo | Tipo | Regra |
|-------|------|-------|
| `apricorns` | 7 × `0–99` | Apricorn Box (item 468), por cor: 0 vermelho … 6 preto |
| `apricornTrees` | `{ day: "AAAA-MM-DD" \| "", trees: number[] }` | árvores colhidas em `day` (0–63, sem repetição); um dia novo zera a lista |
| `berryPots` | 4 × (`{ berry: 149–212, plantedAt: ISO }` \| `null`) | Berry Pots (item 470) |
| `kurt` | `{ apricorn: 0–6, count: 1–99, given: "AAAA-MM-DD" }` \| `null` | apricorns com o Kurt e o dia em que ele os pegou |
| `repel` | `{ item, endsAt: ISO }` \| `null` | Repel ou Black Flute em efeito, no relógio da sessão |

Campos opcionais novos no membro do grupo (e do PC), sem reescrita na migração:

| Campo | Tipo | Regra |
|-------|------|-------|
| `held` | `1–0xFFFF`, opcional | item segurado; ausente é nenhum. Item-chave é recusado pelo servidor (`set-held`) |
| `ppUps` | até 4 × `0–3`, opcional | PP Ups por golpe; ausente é nenhum |

- Saves antigos ganham `newItemState()` vazio; a mochila (`bag`) não muda de forma.
- `newProgress()` traz o estado de itens, para que um jogo novo nasça com ele.
- Testes: `packages/shared/test/save/migrate-v11.test.ts` (migração, ida e volta com segurado, PP Ups, vaso, Kurt e Repel, recusas).
