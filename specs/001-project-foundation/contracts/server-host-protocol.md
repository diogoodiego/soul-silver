# Contrato: protocolo processo principal ↔ servidor de jogo

**Definido em**: `packages/shared/src/server-host-protocol.ts`
**Lado do servidor**: `packages/server` (lógica pura) + `packages/app/src/server-host/entry.ts`
(adaptador do processo utilitário)
**Lado do principal**: `packages/app/src/main/server-host.ts`

Mensagens trocadas por `postMessage` entre o processo principal e o processo utilitário do
servidor. Toda mensagem é um objeto com `type` e é validada por `isHostToServerMessage` ou
`isServerToHostMessage` (type guards em `shared`). Mensagem inválida é descartada e registrada
em log; ela não derruba nenhum dos dois processos.

## Principal → servidor (`HostToServerMessage`)

| `type` | Campos | Quando |
|--------|--------|--------|
| `init` | `protocolVersion: number`, `appVersion: string` | Logo após criar o processo. |
| `get-info` | `requestId: number` | Para cada `getServerInfo()` do renderer. |

## Servidor → principal (`ServerToHostMessage`)

| `type` | Campos | Quando |
|--------|--------|--------|
| `ready` | `protocolVersion: number` | Após receber `init` e iniciar o loop de tick. |
| `status` | `status: ServerStatus` | A cada tick. |
| `info` | `requestId: number`, `info: ServerInfo` | Em resposta a `get-info`. |
| `error` | `code: 'protocol-mismatch'`, `message: string` | `init` com `protocolVersion` diferente; o servidor encerra em seguida. |

## Regras

- O servidor só inicia o loop de tick depois de um `init` com `protocolVersion` igual ao seu.
- `requestId` é gerado pelo principal, único por processo; respostas sem pedido pendente são
  descartadas.
- O principal aplica timeout de 2 s por pedido e rejeita com `server-unavailable`.
- Se o processo do servidor encerrar, o principal marca o status como `stopped`, rejeita os
  pedidos pendentes e avisa o renderer (ver transições em [data-model.md](../data-model.md)).
- `packages/server` não importa `electron` nem conhece `parentPort`: recebe uma função `send`
  e expõe `handleMessage(msg)`, o que permite testá-lo em Node puro (princípio IV).
