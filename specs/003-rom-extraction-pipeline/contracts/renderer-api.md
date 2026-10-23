# Contrato: mudanças na API do preload

**Base**: [002 renderer-api](../../002-release-autoupdate/contracts/renderer-api.md)
**Definida em**: `packages/shared/src/ipc.ts` e `packages/shared/src/assets-state.ts`

`SoulSilverApi` ganha os métodos abaixo. Os existentes não mudam.

```ts
interface SoulSilverApi {
  // existentes: getServerInfo, onServerStatus, getAppVersion, getUpdateState, onUpdateState, restartToUpdate

  getAssetsState(): Promise<AssetsState>;
  /** Devolve a função que cancela a inscrição. */
  onAssetsState(listener: (state: AssetsState) => void): () => void;
  /** Abre o seletor de arquivos no principal; sem efeito fora de needs-rom/rejected. */
  chooseRom(): Promise<void>;
  /** Arrastar e soltar: o preload converte o File em caminho (webUtils.getPathForFile). */
  submitRomFile(file: File): Promise<void>;
  /** Retoma com a ROM guardada (needs-rom com savedRom) ou tenta de novo (failed). */
  startExtraction(): Promise<void>;
  /** Só em extracting/validating. */
  cancelExtraction(): Promise<void>;
  /** Mostra o extractor.log no Explorer. */
  openExtractionLog(): Promise<void>;
}
```

`AssetsState`: ver [data-model.md](../data-model.md#estado-dos-assets-no-app-sharedsrcassets-statets).

## Canais novos (`IpcChannel`)

| Constante | Canal | Direção | Mecanismo |
|-----------|-------|---------|-----------|
| `AssetsGetState` | `assets:get-state` | renderer → principal | `invoke` |
| `AssetsState` | `assets:state` | principal → renderer | `send` |
| `AssetsChooseRom` | `assets:choose-rom` | renderer → principal | `invoke` |
| `AssetsSubmitRomPath` | `assets:submit-rom-path` | renderer (preload) → principal | `invoke` (string) |
| `AssetsStart` | `assets:start` | renderer → principal | `invoke` |
| `AssetsCancel` | `assets:cancel` | renderer → principal | `invoke` |
| `AssetsOpenLog` | `assets:open-log` | renderer → principal | `invoke` |

Como na 001 e na 002, o principal só atende pedidos da janela do app. `assets:submit-rom-path`
valida que o argumento é uma string não vazia; o caminho só é lido, nunca gravado. Pedidos fora
do estado permitido resolvem sem efeito.

O renderer nunca recebe caminhos da pasta de dados nem bytes da ROM (princípio IX).
`PROTOCOL_VERSION` não muda.

## Tela (renderer, `FirstRun.svelte`)

| Estado | O que aparece |
|--------|---------------|
| `checking` | "Verificando os arquivos do jogo…" |
| `needs-rom` | boas-vindas: explicação (precisa de Pokémon SoulSilver dos EUA, `.nds`; nada sai do PC), área de soltar arquivo, "Escolher arquivo"; com `savedRom`, também "Retomar extração"; com `previousRomInvalid`, aviso de que a cópia guardada se perdeu |
| `validating` | "Conferindo o arquivo…" |
| `rejected` | título e detalhe de `romRejectionMessage` + "Escolher outro arquivo" (soltar também funciona) |
| `extracting` | título por modo ("Preparando o jogo" / "Atualizando os arquivos do jogo" / "Reparando…" / "Retomando…"), `stageTitle`, barra e `percent`, "Cancelar" (pede confirmação) |
| `cancelling` | "Cancelando…" |
| `failed` | mensagem por `failure.code` (disco: quanto falta em MB/GB; permissão: pasta), "Tentar de novo", "Abrir log" |
| `ready` | "Assets prontos" por ~1 s na primeira execução, depois a tela principal atual |
