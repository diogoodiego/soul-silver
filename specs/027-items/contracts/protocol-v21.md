# Contrato: protocolo v21

`PROTOCOL_VERSION` 20 → 21 (`shared/src/protocol-version.ts`); apps de versões diferentes recusam a conexão. Mensagens em `shared/src/game/protocol.ts`, todas `strictObject`.

## Cliente → servidor

| Mensagem | Campos | Regra do servidor |
|----------|--------|-------------------|
| `use-item` (existente) | `item`, `partyIndex`, **novo** `moveIndex?: 0–3` | fora de combate; despacha pelo efeito do item (cura, revive, PP Up, Rare Candy, pedra, MT/MO, Repel, Escape Rope); `moveIndex` obrigatório para PP Up e PP Max. Itens-chave: Berry Pots (470) envia `berry-pots`, Apricorn Box (468) envia `apricorn-box`, Dowsing MCHN (471) liga e desliga |
| `use-item-combat` | `item` | só em combate, no Pokémon que o jogador controla; recusa sem o item (`action-refused`), durante uso ou recarga (`item-busy`) ou sem efeito (`item-not-compatible`) |
| `set-held` | `partyIndex`, `item: number \| null` | troca mochila ↔ segurado; recusa sem o item, item-chave, em combate, ou bolso cheio ao devolver (`bag-full`) |
| `berry-plant` | `pot: 0–3`, `item` | exige os Berry Pots, vaso vazio e uma berry com dados de crescimento |
| `berry-harvest` | `pot: 0–3` | só madura (`not-ready` antes); produção entre `berryYield` |
| `debugSetStatus` | `status` | só build de desenvolvimento com o depurador de scripts ligado; status no Pokémon controlado em combate (sonda da camada 3) |

Colher apricorns, pegar itens do chão e escondidos e entregar apricorns ao Kurt passam pela interação e pelos scripts existentes.

## Servidor → cliente

| Mensagem ou campo | Conteúdo |
|-------------------|----------|
| `items-state` | `useEndsTick?`, `cooldownUntilTick?` (ticks do servidor), `repelEndsAt?` (ISO); campos ausentes são nenhum |
| `dowse` | `dir?: 0–359` (0 norte, horário), `near?: 0–1`; sem campos, nada no raio ou o aparelho desligado |
| `berry-pots` | 4 × (`{ berry, stage }` \| `null`), `stage` em `planted`, `sprouted`, `growing`, `blooming`, `ripe` |
| `apricorn-box` | `counts`: 7 números |
| `item-found` | `item`, `count`, `source: "companion" \| "berry"` |
| `party` (membro) | `held?`, `ppUps?` |
| evento de combate `held` | `item`, `amount` (HP curado, 0 sem cura); o item consumível some |
| pedido de script `apricorn` | `counts` (7); respondido com a cor, 7 para cancelar |
| buffer de texto `move` | `id` do golpe (nome do golpe da MT) |
| `NoticeCode` novos | `item-busy`, `item-not-compatible`, `bag-full`, `not-ready`, `repel-ended` |

Testes: `packages/shared/test/game/protocol-v21.test.ts` aceita e recusa cada forma.
