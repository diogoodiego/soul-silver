# Contrato: IPC renderer ↔ main (adições a `SoulSilverApi`)

Todos os argumentos são validados no main; erros voltam como `{ ok: false, reason }`.

| Método | Retorno | Nota |
|--------|---------|------|
| `listSaves()` | `SlotSummary[3]` | |
| `createSave(slot, name, character)` | `Result` | exige `overwrite: true` se ocupado |
| `restoreBackup(slot)` | `Result` | |
| `exportSave(slot)` | `Result` | diálogo de salvar no main |
| `importSave(slot)` | `Result` | diálogo de abrir; valida e migra antes de gravar |
| `startSolo(slot)` | `SessionResult` | sobe o servidor em modo solo e conecta |
| `startHost(slot)` | `SessionResult` | mostra-se após `FirewallNotice`; falha de porta volta com motivo |
| `getSettings()` / `markFirewallNoticeSeen()` | | |
| `watchSessions(listener)` | `() => void` | lista da descoberta, atualizada ao mudar |
| `joinSession(slot, address)` | `SessionResult` (`{ ok, save }`; o renderer envia o save no `hello`) | `address` = `ip[:porta]`, da lista ou digitado |
| (sair) | — | o renderer envia `{ type: "leave" }` por `sendGame` e espera `onGameClosed`; o main grava o save final antes |
| `onGameSaved(listener)` | `() => void` | resultado de cada gravação (indicador "Progresso salvo") |

Os canais `game:message`/`game:closed` existentes continuam; o main intercepta `save` (grava e
responde `save-ack`) antes de repassar ao renderer, que recebe `game:saved` para feedback.
