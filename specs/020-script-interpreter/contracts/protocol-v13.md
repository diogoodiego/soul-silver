# Contrato: protocolo 12 → 13

Os schemas vivem em `packages/shared/src/game/protocol.ts` (testes em
`packages/shared/test/game/protocol-v13.test.ts`). Na implementação, as várias mensagens `script*`
do rascunho viraram quatro: uma requisição com união de tipos, um evento, a trava e o depurador.

## Servidor → cliente

| Tipo | Campos | Efeito |
|------|--------|--------|
| `script` | `id`, `request` | o script espera este cliente; responde `script-answer` com o mesmo `id` |
| `script-event` | `event` | algo que o script mostra sem esperar |
| `script-lock` | `locked` | trava ou libera a entrada do jogador |
| `script-debug` | `at` (ou `null`), `flags`, `vars` | só para quem ligou `debugScript`, e só quando muda |

`request.kind`:

- `say` `{ text, buffers }`: `text` é um id de texto `"BBBB:I"`; `buffers` por slot: `player`, `species { id }` ou `number { value }`. O cliente preenche os nomes e responde quando o jogador confirma.
- `yes-no`: a resposta é `answer` 0 (sim) ou 1 (não).
- `starter` `{ species }`: a resposta é o índice escolhido.
- `wait-fade`, `wait-sound { sound }`: o cliente responde quando termina.

As esperas por tempo (`Wait`) o servidor conta sozinho e nunca vêm ao cliente.

`event.kind`: `close-msg`, `fade { type, color, duration }`, `sound { sound, id }`, `bgm { id | null }`.

Entidades: `npc` entra em `ENTITY_KINDS`, com `data.sprite` (id gráfico do evento) e `data.person` (id do objeto no mapa).

## Cliente → servidor

| Tipo | Campos |
|------|--------|
| `script-answer` | `id`, `answer?` (0 a 5) |
| `debugScript` | `on` |
| `debugSetFlag` | `flag` (1 a 65535), `on`; aceito só com o depurador ligado e em build de desenvolvimento |

## Regras

- `id` cresce por jogador; resposta com `id` diferente do pedido atual é descartada com log.
- Sem resposta em 60 s (`SCRIPT_TIMEOUT_TICKS`), o script é encerrado e o jogador destravado.
- Apps de versões diferentes recusam a conexão (princípio VI).
