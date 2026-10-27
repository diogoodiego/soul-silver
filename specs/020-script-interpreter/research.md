# Pesquisa: Interpretador de scripts

## R1. Modelo de execução

- **Decisão**: máquina de passos sobre `ScriptFile.code` já decodificado; PC é índice em `code`, saltos usam `labels`, chamadas empilham o PC de retorno.
- **Motivo**: o extrator já entrega comandos nomeados com argumentos tipados e rótulos; reinterpretar bytes seria duplicar o decoder.
- **Alternativas**: corrotinas/generators (mais simples de escrever, mas estado não serializável e difícil de depurar passo a passo); VM de bytecode (desnecessária).

## R2. Bloqueio e retomada

- **Decisão**: `step()` retorna `{ kind: "blocked", on: Request }` ou `done`/`missing`/`aborted`. O servidor envia a requisição ao cliente e chama `resume(answer)` na confirmação.
- **Motivo**: comandos não bloqueantes continuam no mesmo tick (spec FR-004) e o runner nunca espera dentro do tick.
- **Timeout**: cliente que não confirma em N s (configurável, padrão 60) tem o script abortado e o jogador destravado; desconexão descarta o runner.

## R3. Comando faltante

- **Decisão**: `MissingCommand { name, file, entry, index }` encerra o runner; o servidor emite `unlock`, loga em memória e, se ligado, em JSONL. Comandos `raw:<id>` do decoder contam como faltantes.
- **Motivo**: FR-008; o log alimenta a priorização junto do `events-report`.

## R4. Flags e variáveis

- **Decisão**: `flags: Set<number>` e `vars: Map<number, number>` por jogador, no save (v5). Argumentos `{ flag }`/`{ variable }` usam o id do original. Flags de sistema/temporárias (limpas ao trocar de mapa no original) ficam marcadas por faixa de id e zeradas no warp.
- **Motivo**: fidelidade (I) e filtro de NPCs por `hideFlag`.
- **Alternativa**: bitset fixo — descartado para manter o save legível e pequeno.

## R5. Nome e gênero

- **Decisão**: o handler de entrada de nome/gênero lê `save.name`/`save.character` e não bloqueia.
- **Motivo**: FR-009; a criação do save já grava ambos.

## R6. Contextos de disparo

- **Decisão**: NPC/placa → interação na frente do jogador; gatilho → entrada na área `x,z,w,h` com `variable == value`; entrada de mapa → `onTransition`/`onLoad`; `frames` avaliados quando as variáveis mudam e ao entrar no mapa. Um runner por jogador; disparo durante um script é ignorado.
- **Motivo**: espelha `map-events`/`levelScripts` do extrator.

## R7. Ligações com specs futuros

- **Decisão**: handlers de movimento/câmera, batalha, loja e PC chamam `host.bridge(kind, args)`. Sem implementação, o host devolve "não suportado" → tratado como comando faltante.
- **Motivo**: entrega o contrato sem implementar a lógica (fora do escopo).

## R8. Depurador

- **Decisão**: o runner expõe `snapshot()` (arquivo, entrada, PC, comando, pilha); o servidor envia `scriptDebug` só a clientes que ligaram a depuração. Alterar flag por `debugSetFlag`, aceito apenas com depuração ligada no host.
- **Motivo**: mesmo padrão do `aiDebug` (spec 019); zero custo desligado.

## R9. Save e protocolo

- **Decisão**: save 4 → 5 (`flags: number[]`, `vars: Record<id, u16>`; migração dá vazio). Protocolo 12 → 13.
- **Motivo**: princípio VI.

## Decisões tomadas na implementação (2026-10-26)

### R10. Fonte da semântica dos comandos

- **Decisão**: cada handler segue a implementação do comando em pret/pokeheartgold (`src/scrcmd*.c`, `include/constants/vars.h` e `flags.h`), e os nomes de argumento seguem `packages/extractor/data/script-commands.json`. Um teste (`shared/test/script/table.test.ts`) roda cada handler com os argumentos da tabela.
- **Motivo**: princípio I. Os nomes da tabela erravam em alguns casos (por exemplo `MovePersonFacing` chama de `z` e `y` a altura e a profundidade); o comentário no handler registra isso.

### R2 (revisto). Mensagens

- **Decisão**: `NPCMsg` e afins bloqueiam até o jogador confirmar o texto; por isso `WaitButton`, `WaitABPress` e `WaitSignpost` não esperam de novo. Sim/não responde 0 para sim e 1 para não (`sub_020416E4`).
- **Motivo**: nos scripts reais, `NPCMsg` costuma vir seguido direto de `CloseMsg`, o que só funciona se a própria mensagem espera.
- **Diferença do original**: no DS, um texto sem pausa no fim fica na tela enquanto o script segue. Aqui cada mensagem espera a confirmação.

### R4 (revisto). Faixas temporárias

- **Decisão**: ao trocar de mapa, zeram as variáveis `0x4000` a `0x401F` e as flags `0x01` a `0x40` (vars.h `NUM_TEMP_VARS`, flags.h `NUM_MAPTEMP_FLAGS`). As variáveis especiais `0x8000` em diante vivem só no runner e nunca entram no save.

### R11. Espera

- **Decisão**: `Wait` conta quadros do DS a 30 por segundo, convertidos para ticks de 20 Hz no servidor. **Premissa** (o campo do HGSS roda a 30 fps); ajuste aqui se a medição mostrar outra taxa.

### R12. Inicial

- **Decisão**: `ChooseStarter` pede ao cliente uma das três espécies e dá o Pokémon no nível 5. Enquanto o novo jogo ainda entrega um inicial (spec 017), o comando não faz nada se a equipe já tem um inicial de Johto (`shortcut:` no handler).
- **Pendente**: decidir se o novo jogo deixa de dar o inicial agora que o laboratório pode fazê-lo.

### R13. Leitura dos arquivos

- **Decisão**: `loadScripts` fica em `app/src/server-host/scripts-loader.ts`, não no servidor. O lint proíbe `node:fs` em `server` (princípios IV e IX). O servidor recebe a interface `ScriptData`.

### R14. Bloqueio pelo movimento

- **Achado**: `ApplyMovement` e `WaitMovement` aparecem 662 vezes no trecho até Violet City. Sem o spec de cutscenes, quase todo evento da história termina como comando faltante na primeira cena. SC-001 depende desse spec. Veja `coverage-gap.md`.
- **Decisão**: movimento continua como ligação (`host.bridge` devolve "não suportado"), sem fingir que andou.
