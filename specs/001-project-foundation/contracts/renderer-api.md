# Contrato: API do preload para o renderer

**Definida em**: `packages/shared/src/ipc.ts` | **Exposta por**: `packages/app/src/preload/index.ts`
**Consumida por**: `packages/client`

O preload expõe exatamente um objeto global, `window.soulSilver`, do tipo `SoulSilverApi`.
O renderer não tem acesso a nada além dele (FR-013, FR-014).

## Tipo

```ts
interface SoulSilverApi {
  /** Pede ao servidor de jogo a informação de exemplo. */
  getServerInfo(): Promise<ServerInfo>;
  /**
   * Recebe o status do servidor a cada tick e na mudança de estado.
   * Devolve a função que cancela a inscrição.
   */
  onServerStatus(listener: (status: ServerStatus) => void): () => void;
}
```

`ServerInfo` e `ServerStatus`: ver [data-model.md](../data-model.md).

## Canais de IPC

Constantes em `shared` (`IpcChannel`). Os nomes não aparecem como string solta em outro lugar.

| Constante | Canal | Direção | Mecanismo | Payload |
|-----------|-------|---------|-----------|---------|
| `IpcChannel.ServerGetInfo` | `server:get-info` | renderer → principal | `invoke` / `handle` | nenhum → `ServerInfo` |
| `IpcChannel.ServerStatus` | `server:status` | principal → renderer | `webContents.send` / `on` | `ServerStatus` |

## Comportamento

- `getServerInfo()` rejeita com `Error` de mensagem `"server-unavailable"` quando o servidor está
  `stopped` ou não responde em 2 s. Resolve em até 3 s em condições normais (SC-002).
- `onServerStatus` repassa ao listener apenas o `ServerStatus`, nunca o objeto de evento do
  Electron. O status chega ~20 vezes por segundo enquanto `running`, e uma vez ao entrar em
  `stopped`.
- O processo principal só responde a `server:get-info` vindo da janela do app (o remetente é
  conferido).

## Proibições

- O preload MUST NOT expor `ipcRenderer`, `require`, `process` ou qualquer API genérica.
- Novos métodos exigem alteração deste contrato e do tipo em `shared` (princípio VI).
