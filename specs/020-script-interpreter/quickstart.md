# Quickstart: validar o interpretador de scripts

Pré-requisitos: `npm install`. Os testes da seção 1 não usam a ROM.

## 1. Testes por grupo de comandos (scripts sintéticos)

```text
npx vitest run packages/shared/test/script packages/shared/test/save packages/shared/test/game/protocol-v13.test.ts
npx vitest run packages/server/test/scripts-
```

Esperado (spec):

- Cada grupo (fluxo, flags e variáveis, mensagem e escolha, itens e dinheiro, Pokémon, cura, warp, fade, espera, áudio, trava e ligações) passa (SC-004): `groups.test.ts`, `flow.test.ts`, `runner.test.ts`.
- Cada handler lê os argumentos que a tabela real de comandos dá: `table.test.ts`.
- Um comando faltante injetado encerra o script, destrava o jogador no mesmo tick e vai para o log (SC-003): `scripts-missing.test.ts`.
- Dois jogadores com flags diferentes veem pessoas diferentes; o mesmo script roda para os dois sem interferência; flags e variáveis voltam na reconexão (SC-002): `scripts-isolation.test.ts`.
- Laço infinito, pilha cheia, salto inválido, resposta velha e cliente que não responde nunca travam o tick: `runner.test.ts`, `scripts-blocking.test.ts`.
- Com 4 jogadores rodando scripts, o tick inteiro fica abaixo de 1 ms: `scripts-perf.test.ts`.

Resultado em 2026-10-26: suíte completa com 239 arquivos e 2.616 testes passando. `perf.test.ts` (anterior a este spec) às vezes falha na suíte paralela e passa sozinho, como a skill `run-soulsilver` já documenta.

## 2. Extração local (pulado sem ela)

```text
npx vitest run packages/app/test/scripts-loader.test.ts
```

Esperado: os eventos e scripts de New Bark Town, Route 29 e Cherrygrove carregam sem erro de schema; uma placa real mostra texto; falar com uma pessoa da Route 30 numa sessão real pede ao cliente um `say` com o id do texto original.

Cobertura do trecho até Violet City: `coverage-gap.md`. **SC-001 ainda não é atingível**: o movimento (`ApplyMovement`, 662 usos) é do spec de cutscenes.

## 3. No app (manual)

```text
npm run build -w @soulsilver/app
SOULSILVER_SCRIPT_LOG=<pasta>\missing.jsonl node .claude/skills/run-soulsilver/driver.mjs <pasta> ...
```

Verificado em 2026-10-26, com o slot salvo na Route 30:

- F3 mostra o painel "Script" junto do painel de depuração.
- As pessoas aparecem como marcadores brancos na frente da casa do Mr. Pokémon.
- Ao pisar no gatilho da linha 66, o script (arquivo 227, entrada 2) roda, para em `ScrCmd_609`, grava a linha no JSONL e o jogador continua andando.

Não verificado na tela: a caixa de diálogo com texto vindo de script, a escolha do inicial e a troca de flag pelo painel.
