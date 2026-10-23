# Contrato: protocolo processo principal ↔ extractor-host

**Definido em**: `packages/shared/src/extractor-host-protocol.ts` (tipos + guardas
`isMainToExtractorMessage` / `isExtractorToMainMessage`, no estilo de `server-host-protocol.ts`)
**Transporte**: `utilityProcess` + `parentPort.postMessage` (mesmo padrão do server-host da 001)

Um extractor-host é criado por tarefa e sai com código 0 depois de enviar a mensagem final.
Mensagens inválidas são descartadas e registradas no log, nos dois lados.

## Principal → extractor-host

```ts
type MainToExtractorMessage =
  | {
      type: "validate-and-copy";
      sourcePath: string;      // caminho escolhido pelo jogador
      romCopyPath: string;     // <userData>/rom/soulsilver.nds
      logPath: string;
    }
  | {
      type: "extract";
      romCopyPath: string;
      workspaceDir: string;    // <userData>/extraction
      logPath: string;
      appVersion: string;
    }
  | { type: "cancel" };
```

## Extractor-host → principal

```ts
type ExtractorToMainMessage =
  | { type: "validated"; result: RomValidationResult }       // em seguida, "copied" ou "failed"
  | { type: "copied" }                                        // final de validate-and-copy (ok)
  | { type: "progress"; stageTitle: string; percent: number } // ≤ 10/s, nunca decresce
  | { type: "completed" }                                     // final de extract
  | { type: "cancelled" }                                     // final de qualquer tarefa
  | { type: "rom-copy-invalid" }                              // final de extract: cópia ausente ou SHA-1 errado
  | { type: "failed"; failure: AssetsFailure };               // final de qualquer tarefa
```

Uma recusa termina `validate-and-copy` só com `validated` (`ok: false`).

## Regras do lado do principal (`assets-controller.ts`)

- Um único extractor-host por vez; pedidos de ROM durante `validating`/`extracting` são ignorados.
- `cancel` → estado `cancelling`; se o processo não sair em 5 s → `kill()`. A atomicidade
  ([research R7](../research.md#r7-atomicidade-staging-commit-e-manifesto-incremental)) garante
  que matar o processo é seguro.
- Saída do processo sem mensagem final → `failed { code: "unexpected" }` e registro no log.
- Depois de `copied`, o controlador envia `extract` a um novo extractor-host (modo `first-run`).
