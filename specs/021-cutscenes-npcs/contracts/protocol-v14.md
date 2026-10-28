# Contrato: protocolo 13 → 14

Schemas em `packages/shared/src/game/protocol.ts`; `PROTOCOL_VERSION = 14`. Apps de versões diferentes recusam a conexão (princípio VI).

## Servidor → cliente

| Tipo | Campos | Efeito |
|------|--------|--------|
| `script` (novo `request.kind: "cutscene"`) | `id`, `actors`, `steps` | só o cliente do jogador em cutscene recebe; responde `script-answer` com o mesmo `id` ao terminar |
| `entities` | entidade do jogador com `data.busy` | os demais jogadores veem "ocupado" |

`steps` e `actors` seguem o [data-model](../data-model.md). O servidor para de enviar, a esse jogador, a posição compartilhada dos NPCs listados em `actors` enquanto o pedido estiver aberto.

## Cliente → servidor

Sem tipos novos: `script-answer` `{ id }` conclui a cutscene. Interações e movimento enviados enquanto `busy` são descartados.

## Regras

- Sem resposta em `SCRIPT_TIMEOUT_TICKS`, o script encerra e o jogador é liberado.
- Passo desconhecido: o cliente responde imediatamente e o servidor registra no log de faltantes.
- `id` segue a regra da spec 020; resposta fora de ordem é descartada com log.
