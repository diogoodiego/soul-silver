# Contrato: mudanças na API do preload

**Base**: [001 renderer-api](../../001-project-foundation/contracts/renderer-api.md)
**Definida em**: `packages/shared/src/ipc.ts` e `packages/shared/src/update-state.ts`

`SoulSilverApi` ganha quatro métodos. Os existentes não mudam.

```ts
interface SoulSilverApi {
  // existentes: getServerInfo, onServerStatus

  /** Versão do app instalado; não depende do servidor de jogo. */
  getAppVersion(): Promise<string>;
  /** Estado atual da atualização (para quem abre a janela depois do início da checagem). */
  getUpdateState(): Promise<UpdateState>;
  /** Recebe cada mudança de estado; devolve a função que cancela a inscrição. */
  onUpdateState(listener: (state: UpdateState) => void): () => void;
  /** Só tem efeito no estado `ready`: aplica a atualização e reabre o app. */
  restartToUpdate(): Promise<void>;
}
```

`UpdateState`: ver [data-model.md](../data-model.md).

## Canais novos (`IpcChannel`)

| Constante | Canal | Direção | Mecanismo |
|-----------|-------|---------|-----------|
| `AppGetVersion` | `app:get-version` | renderer → principal | `invoke` |
| `UpdateGetState` | `update:get-state` | renderer → principal | `invoke` |
| `UpdateState` | `update:state` | principal → renderer | `send` |
| `UpdateRestart` | `update:restart` | renderer → principal | `invoke` |

Como em 001, o principal só atende pedidos da janela do app. `restartToUpdate()` fora do estado
`ready` resolve sem fazer nada.

`PROTOCOL_VERSION` não muda: a API do preload é interna a um mesmo build.
