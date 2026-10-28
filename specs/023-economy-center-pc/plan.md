# Implementation Plan: Economia, Centro Pokémon e PC

**Branch**: `023-economy-center-pc` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/023-economy-center-pc/spec.md`

## Summary

Três serviços novos, todos autoritativos no servidor e disparados pelo interpretador de scripts (spec 020):

1. **Loja**: os comandos `MartBuy`/`MartSell` (hoje só em `BRIDGED`) passam a abrir uma sessão de loja por jogador.
   O estoque vem de `shops.json`, novo arquivo do extrator (tabelas de mart do arm9, com a lista por insígnias do
   Poké Mart comum). O preço de venda é `price / 2` de `items.json`. O servidor valida e aplica compra e venda de
   forma atômica; o cliente tem `Shop.svelte` (lista, quantidade, total, confirmação).
2. **Centro Pokémon**: o script da enfermeira já chama `healParty()` (host em `scripts.ts`). Ele passa a também gravar
   o ponto de retorno; a gravação por entrada no mapa do Centro (`companion.ts`) deixa de existir.
3. **PC**: o save ganha 18 caixas de 30 vagas (`boxes`) e o depósito de itens (`pcItems`), substituindo `storage`.
   Captura e `giveMon` passam a usar a primeira vaga livre das caixas. Um comando de script do PC (nome a confirmar
   na pesquisa R3) abre `PcPanel.svelte`; as operações viajam como mensagens validadas no servidor.

Protocolo 15 → 16, save v6 → v7 com migração `storage` → `boxes`. Sem dependências novas.

## Technical Context

**Language/Version**: TypeScript strict; Node.js do Electron (servidor em `utilityProcess`); Svelte no cliente

**Primary Dependencies**: zod (já usado). Nenhuma nova.

**Storage**: save do jogador (`schemaVersion` 7); `shops.json` na pasta de dados do usuário (extraído); nada de asset no repositório

**Testing**: vitest, test-first na lógica (princípio V): compra, venda, teto de dinheiro, cura, PC, validações, migração v6 → v7. UI verificada manualmente.

**Target Platform**: Windows 10/11 x64

**Project Type**: desktop-app (monorepo `packages/shared|server|client|extractor|app`)

**Performance Goals**: operações de loja e PC são pontuais; sem impacto no tick de 20 Hz

**Constraints**: servidor autoritativo; uma operação ou é aplicada inteira ou nada muda; protocolo e save versionados

**Scale/Scope**: marts de Johto neste marco (Cherrygrove e Violet exigidos); 18 caixas × 30 vagas

## Constitution Check

| Princípio | Avaliação |
|-----------|-----------|
| I Conteúdo fiel | OK: estoques e preços vêm da ROM. Desvio (sem PP, ver R5) vai para `docs/balance-log.md`. |
| II Assets nunca distribuídos | OK: `shops.json` é gerado na pasta do usuário; fixtures sintéticos. |
| III Data-driven | OK: schema zod para `shops.json`; caixas e nomes padrão em `content/pc/pc.json`. |
| IV Servidor autoritativo | OK: o cliente só pede; dinheiro, estoque e vagas decididos no servidor. |
| V Test-first | OK: testes antes de loja, PC, cura e migração. |
| VI Contratos versionados | OK: protocolo 16, save v7 com migração testada; tipos em `shared`. |
| VII Progresso individual | OK: dinheiro, caixas, depósito e retorno por jogador; estoque filtrado pelas insígnias de cada um. |
| VIII Saves | OK: formato validado pelo host na entrada; migração preserva todos os Pokémon. |
| IX Segurança Electron | OK: sem novo acesso de IPC. |
| X Simplicidade | OK: sem dependências; reaproveita scripts, bolsa e `giveItem`/`takeItem`. |
| XI Incremental | OK: Cherrygrove e Violet jogáveis; demais marts só dependem de dados. |

Sem violações. Reavaliado após o desenho: sem mudança.

## Project Structure

### Documentation (this feature)

```text
specs/023-economy-center-pc/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── protocol-v16.md
│   └── content-shops.md
└── tasks.md   # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/
├── game-data/shops.ts          # schema de shops.json (novo)
├── save/schema.ts              # boxes, pcItems; remove storage; v7
├── save/migrate.ts             # passo 6 → 7
├── economy/                    # preço de venda, validação pura de compra/venda (novo)
├── pc/                         # operações puras de caixas (mover, renomear, vaga livre) (novo)
├── game/protocol.ts            # mensagens shop/pc; PROTOCOL_VERSION 16
└── script/handlers/bridge.ts   # comando do PC

packages/extractor/src/data/shops.ts   # tabelas de mart do arm9
packages/server/src/
├── shop.ts                     # sessão de loja por jogador (novo)
├── pc.ts                       # sessão de PC por jogador (novo)
├── scripts.ts                  # bridge MartBuy/MartSell/PC; healParty grava respawn; giveMon usa caixas
├── capture.ts                  # equipe cheia → caixas
└── companion.ts                # remove respawn por entrada

packages/client/src/game/Shop.svelte, PcPanel.svelte; i18n/pt-BR.ts
packages/*/test/                # testes de cada item acima
```

**Structure Decision**: lógica pura em `shared` (testável, totais compartilhados com o cliente), sessões e validação em `server`, telas em `client`, como as specs 015-022.

## Complexity Tracking

Sem violações a justificar.
