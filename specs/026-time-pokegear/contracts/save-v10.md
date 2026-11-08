# Contrato: save v10

`SAVE_SCHEMA_VERSION` 9 → 10 (`shared/src/save/schema.ts`). Migração em `migrate.ts`, ao lado da `8:`:

```text
9: (save) => ({ ...save, phone: newPhone(), schemaVersion: 10 })
```

Campo novo `phone` (strict), por jogador (princípio VII):

| Campo | Tipo | Regra |
|-------|------|-------|
| `contacts` | `number[]` (0–74) | números registrados, na ordem do registro, sem repetição |
| `seeking` | `number[]` | contatos pedindo revanche (`PhoneRematch.seeking`); só números registrados |
| `called` | `number[]` | quem já fez ligação aleatória nesta rodada (save_misc.c) |
| `pending` | `{ caller, call }[]`, até 8 | ligações de história ainda não entregues; ligações aleatórias nunca são gravadas |
| `log` | `{ contact, direction: "in" \| "out", at: ISO }[]`, até 20 | últimas ligações, da mais antiga para a mais nova |

- Saves antigos ganham `newPhone()` vazio. A história registra os números de novo quando passa pelos mesmos scripts.
- `newProgress()` também traz `phone`, para que um jogo novo nasça com ele.
- Testes: `packages/shared/test/save/migrate-v10.test.ts` (migração, ida e volta com ligação pendente, recusas).
