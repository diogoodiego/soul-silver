# Contrato: protocolo de jogo v4 (delta sobre a feature 010)

`PROTOCOL_VERSION` 3 → 4. Mesmo transporte lógico (`Connection`): IPC local ou WebSocket
(`ws://<host>:<porta>`, uma mensagem JSON por frame de texto, máx. 1 MB).

## Cliente → servidor

| Mensagem | Mudança |
|----------|---------|
| `hello` | `+ save: Save` e `+ resumeToken?: string`. `name` sai (vem de `save.name`). |
| `save-ack` | **novo** `{ type, rev }` — o cliente gravou o save `rev`. |
| `input`, `leave` | sem mudança |

## Servidor → cliente

| Mensagem | Mudança |
|----------|---------|
| `welcome` | `+ resumeToken: string`, `+ resumed: boolean` |
| `reject` | códigos novos: `invalid-save`, `save-too-new`, `name-taken`. `message` cita campo e motivo. |
| `save` | **novo** `{ type, save: Save }` — a cada 600 ticks, em warp, no `leave` e no fim de sessão. |
| `session-closed` | enviado depois dos `save-ack` finais ou de 3 s. |

## Regras do `hello`

1. Versão de protocolo diferente → `protocol-mismatch`.
2. Sessão cheia (4, contando reservados) → `session-full`.
3. `resumeToken` válido para um reservado com o mesmo nome → retoma o estado do servidor, `resumed: true`.
4. Nome igual (sem caixa) a conectado ou reservado → `name-taken`.
5. `migrate` + schema + coerência; falha → `invalid-save` / `save-too-new`.
6. Aceito → spawn na posição do save.

## Mensagens host ↔ processo do servidor (`server-host-protocol.ts`)

- `HostToServerMessage` ganha `listen` e `unlisten`: o servidor só abre o socket WebSocket entre os dois (sessão solo nunca envia `listen`).
- `ServerToHostMessage` ganha `listening { port }` e `listen-failed { message }`.
- `ServerInfo` ganha `players` (assentos ocupados, contando reservados) e `maxPlayers`, usados no anúncio.
- Conexões WebSocket recebem `connId` a partir de 1.000.000, para não colidir com a conexão local (IPC).
