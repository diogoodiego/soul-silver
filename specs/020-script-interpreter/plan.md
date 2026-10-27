# Implementation Plan: Interpretador de scripts

**Branch**: `020-script-interpreter` | **Date**: 2026-10-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/020-script-interpreter/spec.md`

## Summary

O extrator (spec 008) já grava `script-file` (comandos nomeados, rótulos, movimentos), `map-events`
(NPCs, placas, gatilhos, `levelScripts`) e o `events-report` (cobertura). Falta o motor. Plano:

- **`shared/script`** (puro, Node): `ScriptRunner` por jogador, uma máquina de passos sobre
  `ScriptFile.code` (PC, pilha de chamadas, registrador de comparação, estado de suspensão). Cada
  `step` executa comandos até um bloqueante ou o fim; os efeitos saem por uma interface `ScriptHost`
  (flags, itens, equipe, warp, mensagens…), então o núcleo não conhece servidor nem rede.
- **Tabela de handlers** `nome do comando → handler`, agrupada (fluxo, flags/variáveis, mensagem,
  itens/dinheiro, Pokémon, mapa/áudio, ligações). Comando sem handler → `MissingCommand`: o runner
  encerra o script, o servidor destrava o jogador e grava no log de faltantes.
- **Servidor** (`server/src/scripts.ts`): carrega `script-file`/`map-events` sob demanda (como
  `world-loader`), dispara os contextos (NPC, placa, gatilho, entrada de mapa, quadros de condição),
  avança os runners no tick, converte comandos bloqueantes em mensagens ao cliente e retoma o
  script na confirmação. Filtro de NPCs por `hideFlag` e flags do jogador na replicação.
- **Save v4 → v5**: `flags` (conjunto de ids) e `vars` (id → u16). Migração testada.
- **Protocolo 12 → 13**: mensagens `script*` (servidor→cliente: `say`, `choice`, `fade`, `wait`,
  `lock`; cliente→servidor: `scriptAck`, `scriptChoice`) e `npcs` já filtrados por jogador.
- **Depurador**: mensagem de dev `scriptDebug` (só quando ligado) + painel Svelte; alterar flag por
  `debugSetFlag`. Log de faltantes em memória + JSONL opcional.
- Sem dependências novas.

## Technical Context

**Language/Version**: TypeScript strict; Node.js do Electron (servidor em `utilityProcess`)

**Primary Dependencies**: zod (já usado). Nenhuma nova.

**Storage**: save do jogador (flags/vars); dados da extração lidos do disco (nunca commitados); log de faltantes em memória e JSONL opcional na pasta de dados do host

**Testing**: vitest em Node puro (shared, server) com scripts sintéticos por grupo de comandos; painel do depurador e apresentação no cliente verificados à mão

**Target Platform**: Windows 10/11 64 bits

**Project Type**: desktop-app (Electron, monorepo)

**Performance Goals**: com 4 jogadores executando scripts, custo ≤ 1 ms por tick; um `step` roda no máximo `MAX_STEPS` (ex.: 10 000) comandos sem bloqueante antes de abortar (laço infinito)

**Constraints**: servidor autoritativo; um runner por jogador; confirmação ausente nunca bloqueia o tick (timeout e desconexão descartam o runner); fixtures sintéticas (princípio II)

**Scale/Scope**: ~2 000+ ids de flag e ~500 variáveis do original; comandos priorizados pelo `events-report` (introdução até Violet City)

## Constitution Check

| Princípio | Conformidade |
|-----------|--------------|
| I. Conteúdo fiel | OK. Scripts, textos e flags vêm da extração; semântica dos comandos segue o original. Nenhum desvio de balanceamento. |
| II. Assets nunca distribuídos | OK. Só código; testes com `ScriptFile` sintéticos. |
| III. Data-driven | OK. Scripts e `map-events` são dados; schemas já validam no carregamento. A tabela de handlers é código por natureza (semântica de comando), não conteúdo. |
| IV. Servidor autoritativo | OK. Interpretador em `shared/script` (Node puro) rodado só pelo servidor; cliente apresenta. |
| V. Test-first | Aplicável (interpretador de scripts). Cada grupo nasce com teste vermelho. |
| VI. Contratos versionados | Protocolo 12 → 13; save v4 → v5 com migração; schemas em `shared`. |
| VII. Progresso individual | OK para flags, variáveis e filtro de NPCs. **Nota**: o princípio diz que cutscenes rodam no cliente de quem as disparou; aqui o *estado* do script fica no servidor (exigido pela spec e pelo IV) e só a *apresentação* roda no cliente desse jogador. Os demais veem o jogador como "ocupado". Compatível; a emenda não é necessária. |
| VIII. Saves | Flags/vars entram no save validado pelo host (`coherence.ts` confere ids e faixas). |
| IX. Segurança Electron | Não afetado (nada novo no renderer além de UI via IPC/WS existentes). |
| X. Desempenho e simplicidade | Orçamento acima; sem dependência nova; sem bytecode próprio — roda direto sobre `code[]` decodificado. |
| XI. Entrega incremental | Marco jogável: introdução até Violet City, comando a comando pelo relatório de cobertura. |

Re-avaliação pós-design: sem violações; Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/020-script-interpreter/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── protocol-v13.md
│   └── save-v5.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/
├── script/
│   ├── runner.ts        # ScriptRunner: PC, pilha, comparação, suspensão, limites
│   ├── host.ts          # interface ScriptHost (efeitos)
│   ├── handlers/        # flow, flags, message, items, pokemon, world, bridge
│   ├── missing.ts       # MissingCommand + formato do log
│   └── index.ts
├── save/schema.ts       # v5: flags, vars; migrate.ts; coherence.ts
└── game/protocol.ts     # mensagens script*, debug*

packages/server/src/
├── scripts.ts           # carregamento, contextos, runners por jogador, ponte com session
├── session.ts           # dispara contextos, trava/libera, filtra NPCs por flag
└── replication.ts       # NPCs filtrados por jogador

packages/client/src/
├── game/DialogBox.svelte (reuso: say/choice), net/game-connection.ts
└── game/ScriptDebug.svelte   # painel de dev

packages/shared/test/script/ , packages/server/test/scripts*.test.ts
```

**Structure Decision**: núcleo puro em `shared/script` (testável sem servidor, reutilizável pelo
depurador), adaptador fino no servidor. Segue o padrão do spec 019 (`shared/ai` + `server`).

## Complexity Tracking

Sem violações a justificar.
