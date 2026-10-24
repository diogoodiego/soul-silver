# Data Model: LAN, sessões e saves

## Save (shared, `save/schema.ts`)

| Campo | Tipo | Regra |
|-------|------|-------|
| `schemaVersion` | int | `= SAVE_SCHEMA_VERSION` (1) após migração |
| `name` | string | 1..`PLAYER_NAME_MAX` (16), trim não vazio |
| `character` | `"male" \| "female"` | |
| `area` | string | mapa existente no mundo do host (coerência) |
| `x`, `y` | number | finitos, dentro do mapa (coerência) |
| `facing` | direção cardinal | |
| `playTimeMs` | int ≥ 0 | |
| `savedAt` | ISO date | |
| `rev` | int ≥ 0 | incrementa a cada save emitido pelo servidor |

Campos de progresso (flags, equipe, itens) entram nas features seguintes, cada um com migração.
Até lá, a regra de "nível impossível" é testada num schema de teste estendido (research R6).

## Slot (app, `save-store.ts`)

- `index`: 1..3
- `current`: `slot-N.json` → `ok(save) | corrupt(reason) | empty`
- `backup`: `slot-N.json.bak` → idem
- **Resumo para o menu**: `{ index, status: "ok" | "corrupt" | "unrecoverable" | "empty", name,
  character, area, playTimeMs, savedAt, backupAvailable }`

Transições: `empty → ok` (novo jogo/import); `ok → ok` (gravação: atual vira `.bak`);
`corrupt + backup ok → ok` (restaurar: copia `.bak` para atual); `corrupt + backup corrupt →
unrecoverable` (nada é apagado).

## Settings (app, `settings.json`)

- `firewallNoticeSeen: boolean`

## Anúncio de partida (shared, `lan/discovery.ts`)

`{ game: "soulsilver", protocolVersion, appVersion, hostName, players, maxPlayers, port, sessionId }`
+ endereço de origem (do pacote UDP). Na lista: `joinable | disabled("version" | "full")`.

## Sessão (server)

- `mode`: `"solo" | "hosted"`
- `players`: `{ id, name, conn | undefined, save, resumeToken, reservedUntilTick? }`
- Estados do jogador: `connected → reserved (queda, 2 min) → connected (resume) | removed (expira)`;
  `connected → removed` (`leave`, com save final enviado).
- Estados da sessão: `open → closing (enviou save final, espera acks ≤ 3 s) → closed`.

## Recusa

`{ code, message }` com `code ∈ protocol-mismatch | session-full | session-closed | invalid-save |
save-too-new | name-taken`; `message` legível em PT-BR com o campo e o motivo.
