# Quickstart: validação desta feature

**Feature**: [spec.md](./spec.md) | **Contratos**: [contracts/](./contracts/)

## Pré-requisitos

- Windows 10/11 x64, Node 24, `npm install` na raiz.
- Para os passos manuais 3 a 6: um dump próprio de Pokémon SoulSilver (EUA). Ele nunca entra no
  repositório (o `.gitignore` e o hook de pre-commit bloqueiam `*.nds` e `assets/`).

## 1. Checagens automáticas

```text
npm run typecheck
npm run lint
npm test
```

Esperado: tudo verde. Os testes do extractor cobrem, sem ROM real:

| Critério | Onde |
|----------|------|
| SC-004 (cada motivo de recusa) | `packages/extractor/test/rom/validate.test.ts` |
| FR-014 (NDS + NARC) | `test/nds/*.test.ts`, `test/narc.test.ts` |
| FR-010/FR-011 (registro e planner) | `test/pipeline/registry.test.ts`, `plan.test.ts` |
| SC-005 (≥ 10 pontos de interrupção) | `test/pipeline/interruption.test.ts` |
| SC-006 (só a etapa alterada roda) | `test/pipeline/update.test.ts` |
| SC-008 (app × CLI) | `test/cli.test.ts` |
| Estados do app | `packages/app/test/assets-controller.test.ts` |

## 2. Confirmar o hash de referência (uma vez, antes do merge)

```text
certutil -hashfile D:\roms\soulsilver.nds SHA1
```

O valor tem que estar em `REFERENCE_ROM_SHA1` ([research R2](./research.md#r2-hash-de-referência-da-rom))
e no DAT do No-Intro para "Pokemon - SoulSilver Version (USA)". Se divergir, **não** troque o
valor sem conferir o DAT: o dump pode estar alterado.

## 3. CLI

```text
npm run extract -- --list
npm run extract -- --rom D:\roms\soulsilver.nds
npm run extract -- --rom D:\roms\soulsilver.nds            # de novo
npm run extract -- --rom D:\roms\soulsilver.nds --verify
npm run extract -- --rom D:\roms\soulsilver.nds --force rom-unpack
```

Esperado:

- `--list` mostra `rom-unpack v1`.
- A primeira execução termina com código 0 e cria `assets/manifest.json` e
  `assets/stages/rom-unpack/{binaries,filesystem,narc}`; `narc/a/0/0/0/` contém `0000.bin`, …
- A segunda execução pula `rom-unpack` ("em dia").
- `--verify` termina com 0.
- Com uma cópia da ROM com um byte alterado: código 3 e a mensagem de arquivo modificado.
- Com uma ROM de HeartGold, se houver: código 3 e a mensagem de HeartGold.

## 4. Primeira execução no app (SC-001, SC-002, SC-003)

1. Apague `%APPDATA%\SoulSilver Desktop\extraction` e `...\rom` (se existirem).
2. `npm run dev`.
3. Esperado: tela de boas-vindas. Solte um `.zip` qualquer → mensagem de arquivo compactado. Solte
   um `.txt` → "não é uma ROM de DS".
4. "Escolher arquivo" → a ROM. Cronometre: a validação aparece em < 5 s; da escolha até "Assets
   prontos", < 2 min.
5. Esperado: progresso com "Desempacotando a ROM" e porcentagem subindo; depois "Assets prontos"
   e a tela principal.
6. Feche e abra o app: vai direto para a tela principal. Meça o tempo com e sem a pasta
   `extraction` (renomeie temporariamente): diferença < 1 s (SC-007).

## 5. Interrupção e cancelamento (US4)

1. Apague `extraction\`, abra o app (a ROM guardada continua lá) → "Retomar extração".
2. Durante o progresso, feche a janela → confirmação → confirme.
3. Abra de novo: a extração recomeça sozinha, sem pedir a ROM, e termina em "Assets prontos".
4. Repita, mas encerre `electron.exe` pelo Gerenciador de Tarefas no meio: mesmo resultado.
5. Clique em "Cancelar" no meio → volta à boas-vindas com "Retomar extração".

## 6. Atualização e reparo (US3, SC-006)

1. Com assets prontos, mude `version` de `rom-unpack` para 2 (só localmente) e rode `npm run dev`.
2. Esperado: "Atualizando os arquivos do jogo", sem pedir a ROM; ao final, `manifest.json` mostra
   `"version": 2`. Desfaça a mudança.
3. Apague uma pasta qualquer em `extraction\stages\rom-unpack\narc\` e abra o app → "Reparando…",
   sem pedir a ROM.
4. Apague `rom\soulsilver.nds` e uma pasta de saída → o app volta à boas-vindas avisando que
   precisa da ROM de novo.

## 7. Log (US5)

1. Deixe `extraction\` somente leitura (Propriedades → Somente leitura, aplicar às subpastas) e
   force uma reextração (passo 6.1).
2. Esperado: tela de falha com mensagem de permissão, "Tentar de novo" e "Abrir log".
3. "Abrir log" → Explorer com `extractor.log` selecionado. O log tem a versão do app, a versão
   das etapas, a etapa que falhou e o erro, e nenhum conteúdo binário.

## 8. Pacote sem assets (princípio II)

```text
npm run dist
node scripts/verify-package.ts packages/app/dist
```

Esperado: a verificação passa (o extrator é só código).
