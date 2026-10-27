# Modelo de dados: Interpretador de scripts

## Estado persistido (save v5)

| Campo | Tipo | Regra |
|-------|------|-------|
| `flags` | `number[]` | ids únicos, 0..0xFFFF; flag 0 é "sempre" e nunca gravada |
| `vars` | `Record<string, number>` | chave = id da variável, valor 0..0xFFFF; ausente = 0 |

Migração 4 → 5: ambos vazios. `coherence.ts` rejeita ids fora da faixa e duplicados.

## Runner (memória, por jogador)

| Campo | Descrição |
|-------|-----------|
| `file`, `entry` | script em execução (`ScriptRef`) |
| `pc` | índice em `ScriptFile.code` |
| `stack` | PCs de retorno (limite 32) |
| `cmp` | resultado da última comparação (`<`, `=`, `>`) |
| `result` | valor devolvido por escolha/mensagem (`LASTRESULT` do original) |
| `state` | `running` / `blocked(request)` / `done` / `missing` / `aborted` |
| `steps` | comandos desde o último bloqueio (limite `MAX_STEPS`) |

Transições: `running → blocked` (comando bloqueante) → `running` (`resume`); `running → done` (`End`);
`running → missing | aborted` (comando faltante, destino inexistente, laço, pilha cheia, timeout, desconexão).
Em `done`, `missing` e `aborted` o jogador é destravado.

## Requisição bloqueante

União discriminada: `say { text, vars }`, `choice { options }` (sim/não e menus), `fade { dir }`,
`wait { ticks }`, `move { ... }` (ligação). Resposta: `ack` ou `choice { index }`.

## Log de faltantes

`{ time, command, file, entry, index, player }`; agregado por comando com contagem para cruzar com o `events-report`.

## Visibilidade de NPC

NPC visível ao jogador se `hideFlag === 0 || !flags.has(hideFlag)`. Recalculado ao entrar no mapa e
quando uma flag muda.
