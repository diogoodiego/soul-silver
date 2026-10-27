# Contrato: save v5

Acrescenta ao save v4 (`shared/src/save/schema.ts`):

```text
flags: number[]                    // ids únicos, 1..65535
vars:  Record<string, number>      // id -> 0..65535
```

- `SAVE_SCHEMA_VERSION` 4 → 5; `migrate.ts` preenche `flags: []` e `vars: {}`.
- `newProgress()` inicia ambos vazios.
- Teste de migração: save v4 de fixture sobe para v5 sem perder campos; save v5 com id duplicado ou fora da faixa é recusado pelo host.
