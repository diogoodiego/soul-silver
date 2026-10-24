# Quickstart: validar servidor de jogo e protocolo

## Pré-requisitos

`npm install` na raiz. Nenhuma ROM é necessária para os testes (colisão de fixture).

## Testes automatizados

```sh
npx vitest run packages/shared packages/server packages/client
```

| Cenário | Teste | Esperado |
|---|---|---|
| 4 clientes falsos se movendo (US1) | `server/test/session.test.ts` | 4 `welcome`, posições avançam, 5º recebe `reject session-full` |
| Versão diferente (SC-004) | `server/test/handshake.test.ts` | `reject protocol-mismatch` com as duas versões |
| Mensagens malformadas (SC-005) | `server/test/malformed.test.ts` | 1.000 lixos, servidor segue, outros clientes intactos |
| Filtro por área (SC-007) | `server/test/relevance.test.ts` | nenhuma entidade de outra área em `state` |
| Delta | `server/test/replication.test.ts` | só campos alterados; `full` na entrada |
| Replay (SC-002) | `server/test/replay.test.ts` | hash final igual ao original |
| Desempenho (SC-001) | `server/test/perf.test.ts` | pior tick < 10 ms em 1.200 ticks |
| Previsão (SC-003) | `client/test/net/prediction.test.ts` | posição muda no mesmo quadro do input; correção suave |
| Interpolação (SC-006) | `client/test/net/interpolation.test.ts` | posição contínua com jitter de ±30 ms |

## Verificação manual

1. `npm run dev`, entrar no jogo solo.
2. Apertar F3: o painel mostra tick atual e último/média/pior em ms.
3. Andar: o personagem responde sem atraso.
4. Mudar `PROTOCOL_VERSION` só no cliente e reabrir: aparece a mensagem de versão incompatível.
