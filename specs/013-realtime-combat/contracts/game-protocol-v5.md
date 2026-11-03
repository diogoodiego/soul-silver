# Contrato: protocolo de jogo v5

`PROTOCOL_VERSION` passa de 4 para 5. Clientes v4 são recusados com `protocol-mismatch`, pela regra que
já existe. O schema fica em `packages/shared/src/game/protocol.ts`. Abaixo, só as mudanças em relação
ao v4.

## Cliente → servidor

Campos do `input`:

| Campo | Tipo | Regra |
|-------|------|-------|
| `buttons` | bits | Os bits 0 a 3 são os golpes 1 a 4. O golpe começa quando o botão é apertado (borda de subida); segurar o botão não repete. |
| `aim` | `{x, y}` opcional | Vetor no plano do mundo, com cada eixo em [−1, 1]; o servidor normaliza. Ausente ou zero: o golpe sai na direção do `facing`. |

O servidor ignora, sem responder, um golpe pedido em qualquer destas situações:
- o golpe está em cooldown;
- o Pokémon está conjurando ou numa investida;
- o Pokémon está imóvel;
- o slot está vazio.

O `hello` aceita `arena?: { a, b }`, onde cada lado é `{ species, level: 1..100, moves: id[1..4] }`.
(Substituído no protocolo v18 pela arena com treinador, time e adversário: ver `specs/024-playable-campaign-zephyr/contracts/protocol-v18.md`.)
Só é aceito pelo servidor iniciado com `--dev-arena`, isto é, com o app não empacotado. Nos outros
casos, e com espécie ou golpe inexistente, a resposta é `reject` com o código novo `invalid-message`.

## Servidor → cliente

Mensagem nova `{ type: "combat-event", tick, events: HitEvent[] }`. Vai a cada jogador que está na
área do alvo.

`HitEvent = { kind, attacker, target, move, amount, effectiveness, crit, push: {x, y}, status? }`

| `kind` | Significado |
|--------|-------------|
| `hit` | dano |
| `immune` | sem efeito |
| `tick` | dano de status |
| `heal` | cura |
| `status` | status aplicado |
| `stages` | estágio mudou |
| `failed` | golpe travado pela paralisia, ou conjuração cortada por flinch |

O `data` das entidades `pokemon` tem:
- `species`, `level`, `hp`, `hpMax`;
- `owner`, que é o id do jogador como texto ou `"wild"`;
- `status` (id ou `""`) e `confused`;
- `casting`, com o slot de 1 a 4, ou 0;
- `flash`;
- `move1..4` e `cd1..4` (ticks restantes);
- `stg_<stat>`, só para os estágios diferentes de 0.

As entidades `projectile` têm `move`, `caster` e `field`.
