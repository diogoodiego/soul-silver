# Contract: protocolo de jogo cliente ↔ servidor

Definido em `packages/shared/src/game/protocol.ts` (zod). `PROTOCOL_VERSION` sobe para **2**.
Toda mensagem é um objeto JSON com `type`. Mensagem que falha na validação é descartada e
registrada; a conexão segue aberta.

## Cliente → servidor

| type | Campos | Quando |
|---|---|---|
| `hello` | `protocolVersion: int`, `name: string(1–16)` | primeira mensagem |
| `input` | `seq: int`, `dir: Direction \| null`, `buttons: int` | uma por tick local, após `welcome` |
| `leave` | — | saída voluntária |

## Servidor → cliente

| type | Campos | Quando |
|---|---|---|
| `welcome` | `protocolVersion`, `playerId`, `entityId`, `tick`, `tickRateHz: 20` | handshake aceito |
| `reject` | `code: "protocol-mismatch" \| "session-full" \| "session-closed"`, `message`, `serverProtocolVersion` | handshake recusado; a conexão é fechada em seguida |
| `state` | `tick`, `lastInput: int`, `full: boolean`, `spawned: Entity[]`, `changed: EntityDelta[]`, `removed: EntityId[]` | todo tick, para cada cliente |
| `debug` | `metrics: TickMetrics` | 1×/s |
| `session-closed` | `reason: "host-left" \| "closed-by-host"` | encerramento (o host é sempre o primeiro jogador, então "último sai" já é `host-left`) |

Mensagem de `reject` por versão: `"Versão do protocolo incompatível: servidor {S}, cliente {C}. Atualize o jogo."`

## Regras

- Mensagens antes de `hello` que não sejam `hello` → descartadas.
- `full: true` na primeira `state` e em troca de área: o cliente substitui todo o estado.
- `changed` só contém entidades já enviadas; o cliente aplica campo a campo.
- O transporte é confiável e ordenado (IPC local; WebSocket na feature 12).

## Host ↔ processo do servidor

Host → servidor: `client-message {connId, msg}` (a primeira mensagem de um connId abre a conexão) e `client-close {connId}`. Servidor → host: `client-send {connId, msg}` e `client-close {connId}`. Validados em `server-host-protocol.ts`; o `msg` é validado pelo servidor de jogo e pelo cliente. O main usa um connId novo a cada `connectGame()` do renderer e fecha o anterior.

As métricas de tick vão aos clientes pela mensagem `debug`; o `status` host↔servidor não mudou.
