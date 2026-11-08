# Contrato: protocolo 20

Muda de 19 para 20 (`shared/src/protocol-version.ts`). Clientes e hosts de versões diferentes recusam a conexão, como hoje. Testes: `packages/shared/test/game/protocol-v20.test.ts`.

## Servidor → cliente

| Mensagem | Campos | Quando |
|----------|--------|--------|
| `clock` | `minuteOfDay` (0–1439), `weekday` (0–6, domingo 0), `fixed` | em `debugSetClock`; ao entrar e a cada 5 s (US1, T021) |
| `phone-call` (buffers de texto ganham `place { mapsec }` e `text { text }`) | `callId`, `contact` (0–74), `name` (id do texto 0 do banco do contato), `direction: "in" \| "out"`, `lines` (1–16 ids de texto), `choices?` (2–4 ids), `buffers?` | entrega de ligação, nunca com o jogador ocupado |
| `phone-state` | `contacts: { id, name, seeking }[]` (`name`: texto 0 do banco do contato), `log` | ao abrir a aba e depois de mudanças |
| `radio-state` | `shows: { id, bank }[]`, `tuned`, `lines?` | ao abrir a aba e ao sintonizar |
| `gear-map` | `visited`, `others: { name, area, x, y }[]` (até 3) | ao abrir a aba e com ela aberta |

## Cliente → servidor

| Mensagem | Campos | Validação no servidor |
|----------|--------|----------------------|
| `phoneDial` | `contact` | contato registrado; jogador livre; sem chamada em curso |
| `phoneAnswer` | `callId`, `choice?` (0–3) | a chamada existe e é do jogador |
| `radioTune` | `channel: string \| null` | programa existe |
| `gearOpen` / `gearClose` | — | o jogador conta como menu aberto |

Até as histórias implementarem, o servidor responde `action-refused` a essas cinco.

## Desenvolvimento (só com `devTools` e o depurador de scripts ligado; recusado e registrado no log nos outros casos)

`debugSetClock { clock }`, em que `clock` é:

- `{ mode: "host" }`: volta ao relógio do host;
- `{ mode: "fixed", hour, minute?, weekday? }`: fixa um instante da semana atual;
- `{ mode: "advance", minutes }` (1 a 10080): avança a partir da hora atual; um relógio fixado continua fixado.

Todos os jogadores recebem `clock`. Testes: `packages/server/test/dev-clock.test.ts`.
