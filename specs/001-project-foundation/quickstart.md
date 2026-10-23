# Quickstart: validação da fundação

**Feature**: [spec.md](./spec.md) | **Date**: 2026-10-23

Roteiro para provar, de ponta a ponta, que a feature atende o spec. O README do repositório
é a versão voltada ao desenvolvedor; este guia é a lista de verificação.

## Pré-requisitos

- Windows 10 ou 11, 64 bits.
- Git for Windows.
- Node.js 24 LTS (a versão está em `.nvmrc`).
- Repositório git inicializado e ligado ao GitHub (para os cenários 4 e 5).

## Cenário 1 — Do clone ao app aberto (US1, SC-001)

```powershell
git clone <url> soul-silver
cd soul-silver
npm install
npm run dev
```

**Esperado**: a janela "SoulSilver Desktop" abre. Cronometre do `git clone` até a janela:
menos de 15 minutos.

**Variação**: com um Node diferente da versão 24, `npm install` falha com mensagem de engine
indicando a versão esperada e a encontrada.

## Cenário 2 — Caminho renderer → servidor (US2, SC-002, SC-003)

Com o app aberto:

1. Em até 3 s a janela mostra versão do app, versão do protocolo (`1`) e estado `running`.
2. Anote o contador de ticks, espere 10 s cronometrados e anote de novo: a diferença fica
   entre 190 e 210.
3. Minimize a janela por 10 s e restaure: o contador avançou ~200 nesse intervalo.
4. No DevTools da janela (`Ctrl+Shift+I`), execute no console:
   - `typeof require` → `"undefined"`;
   - `typeof process` → `"undefined"`;
   - `Object.keys(window.soulSilver)` → `["getServerInfo", "onServerStatus"]`;
   - `location.href = "https://example.com"` → a navegação não acontece.
5. Encerre o processo do servidor (no Gerenciador de Tarefas, o processo utilitário
   "SoulSilver Game Server"): a janela mostra o estado de erro, o contador para e a janela
   continua respondendo.

## Cenário 3 — Checagens com um comando (US3, SC-004)

```powershell
npm run typecheck
npm run lint
npm test
```

**Esperado**: os três passam. O relatório de testes lista os projetos `app`, `client`,
`server`, `shared`, `extractor` (e `scripts`), cada um com ao menos um teste.

**Variação**: crie um erro de tipo em `packages/server/src` → `npm run typecheck` falha
apontando `@soulsilver/server` e o arquivo. Desfaça.

## Cenário 4 — Bloqueio de assets (US4, SC-005, SC-006)

```powershell
New-Item -ItemType File roms/test.NDS -Force
New-Item -ItemType File assets/maps/x.png -Force
New-Item -ItemType File tmp/a0081.narc -Force
New-Item -ItemType File docs/screenshot.png -Force
git add -f roms/test.NDS assets/maps/x.png tmp/a0081.narc docs/screenshot.png
git commit -m "test: should be blocked"
```

**Esperado**: o commit falha e a mensagem lista os quatro arquivos com o motivo de cada um
(formato em [contracts/forbidden-files-check.md](./contracts/forbidden-files-check.md)).

```powershell
git restore --staged .
New-Item -ItemType File art/icon-test.png -Force
git add art/icon-test.png
git commit -m "test: art is allowed"
```

**Esperado**: o commit passa. Desfaça com `git reset HEAD~1` e apague os arquivos de teste.

## Cenário 5 — Integração contínua (US5, SC-007)

1. Faça push de um branch com o código válido → o workflow `CI` roda em `windows-latest` e
   passa em todos os passos.
2. Faça push de um commit com um teste falhando → o workflow falha no passo `Test`.
3. Faça push de um commit com `assets/x.png` criado com `git commit --no-verify` → o workflow
   falha no passo `Forbidden files`, nomeando o arquivo.

## Referências

- API do renderer: [contracts/renderer-api.md](./contracts/renderer-api.md)
- Protocolo com o servidor: [contracts/server-host-protocol.md](./contracts/server-host-protocol.md)
- Entidades e transições: [data-model.md](./data-model.md)
