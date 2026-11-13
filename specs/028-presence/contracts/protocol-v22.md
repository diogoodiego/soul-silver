# Contrato: protocolo v22

`PROTOCOL_VERSION` 21 → 22 (`shared/src/protocol-version.ts`); apps de versões diferentes recusam a conexão. Mensagens em `shared/src/game/protocol.ts`, todas `strictObject`. O save não muda.

Item 028.1 do roadmap (presença): nome sobre cada jogador, lista da sessão com o lugar de cada um e indicadores de combate, cena e menu enviados pelo servidor.

## Servidor → cliente

| Mensagem ou campo | Conteúdo |
|-------------------|----------|
| `players` (existente) | cada jogador ganha **novo** `area: string`, o id do mapa em que está. A lista é reenviada quando alguém entra, sai ou troca de mapa |
| `data.presence` na entidade do jogador (novo) | `"combat"`, `"cutscene"` ou `"menu"`; ausente quando o jogador está livre. Vale para todos os clientes que veem a entidade |

### Regra do `presence`

O servidor recalcula a presença de cada jogador a cada tick, nesta ordem de prioridade:

1. `combat`: o Pokémon do jogador está em combate (selvagem ou treinador).
2. `cutscene`: um script do jogador está rodando (Princípio VII: os outros veem o jogador ocupado).
3. `menu`: o menu completo ou o Pokégear está aberto.

O campo `busy` (spec 017 e 021) continua igual. O cliente mostra a presença quando ela existe e "ocupado" quando só o `busy` está ligado, como na aproximação de um treinador.

## Cliente

- Nome de cada outro jogador desenhado acima dele, seguido da presença (ex.: `Silver · em combate`).
- Aba Online: lugar de cada jogador, com o nome do mapa lido pelo MAPSEC do cabeçalho (o id do mapa enquanto o cabeçalho não chega), e a presença dos jogadores em vista.

## Testes

| Camada | Caso | Comando |
|--------|------|---------|
| 1 | `players` sem `area` é recusado; com `area`, aceito | `npx vitest run --project shared test/game/protocol-v12.test.ts` |
| 2 | o outro jogador vê `menu`, `combat` e `cutscene`, e nada depois do menu fechado; a lista traz o `area` e é reenviada na troca de mapa | `npx vitest run --project server test/presence.test.ts` |
| 2 | cliente v21 recusado | `npx vitest run --project server test/handshake.test.ts` |
| 4 | nome e presença sobre o outro jogador e lugar na aba Online, com 2 jogadores | skill `run-soulsilver`, capturas em `.evidence/028/` |
