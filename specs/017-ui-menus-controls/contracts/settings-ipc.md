# Contrato: IPC de configurações

Em `shared/ipc.ts`, exposto pelo preload como `window.soulSilver`:

| Chamada | Retorno | Efeito |
|---------|---------|--------|
| `getSettings()` | `AppSettings` | já existe; agora com os campos de [data-model.md](../data-model.md) |
| `setSettings(patch: Partial<AppSettings>)` | `AppSettings` | o processo principal valida o patch (campo inválido é recusado e mantém o anterior), grava de forma atômica e aplica `window`/`fullscreen` na janela na hora |
| `quitApp()` | `void` | fecha o app (botão Sair) |

`listSaves()` passa a incluir `badges` em cada slot `ok`.
