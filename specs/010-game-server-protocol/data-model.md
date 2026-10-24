# Data Model: Servidor de jogo e protocolo

## Session

| Campo | Tipo | Regras |
|---|---|---|
| seed | uint32 | definido na criação; alimenta o RNG |
| state | `"open" \| "closed"` | `closed` é terminal |
| tick | int ≥ 0 | avança só pelo tick loop ou replay |
| hostId | PlayerId | o primeiro a entrar; se sai, a sessão fecha |
| players | Map<PlayerId, Player> | 1–4 enquanto aberta |

Transições: `create → open`; `open → closed` (host sai, último sai, `close()` do host). Entrada em `closed` é recusada.

## Player

| Campo | Tipo | Regras |
|---|---|---|
| id | PlayerId (int) | único na sessão, nunca reutilizado |
| name | string 1–16 | do handshake |
| entityId | EntityId | entidade `player` controlada |
| lastInputSeq | int | último `seq` processado; começa em -1 |
| inputQueue | Input[] | máx. 10; um consumido por tick |
| lastSeenAt | tick | para timeout de 10 s (200 ticks) |
| sent | Map<EntityId, Entity> | último estado enviado (base do delta) |

## Entity

| Campo | Tipo | Regras |
|---|---|---|
| id | EntityId (int) | único, nunca reutilizado |
| kind | `"player" \| "pokemon" \| "projectile" \| "wild"` | extensível (ex.: `"npc"`) |
| area | string | id da área (mapa) |
| x, y | number (px) | posição |
| facing | Direction | do `shared/maps` |
| data | Record<string, primitive> | específico do tipo; replicado por campo |

## Input

| Campo | Tipo | Regras |
|---|---|---|
| seq | int ≥ 0 | crescente por jogador |
| dir | Direction \| null | null = parado |
| buttons | bitmask int | reservado para combate (13) |

## EntityDelta

`{ id, ...camposAlterados }` — só os campos que mudaram desde o último envio àquele jogador.

## Recording

`{ protocolVersion, seed, events: { tick, kind: "join"|"leave"|"input", playerId, name?, input? }[] }`

## TickMetrics

`{ lastMs, avgMs, maxMs, overruns }` sobre os últimos 100 ticks.

## Relevância

`isRelevant(player, entity) = entity.area === playerEntity.area` — ponto único; feature futura acrescenta flags (princípio VII).
