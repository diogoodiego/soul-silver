# Contrato: protocolo de jogo v9

`PROTOCOL_VERSION` 8 → 9. Clientes v8 recebem `reject` com `version-mismatch`.

## Cliente → servidor (novas)

| Mensagem | Campos | Validação no servidor |
|----------|--------|-----------------------|
| `menu` | `open: boolean` | Com `open: true` em combate: não muda `busy` e responde `notice { code: "menu-blocked" }`. |
| `reorder-party` | `from, to: 0–5` | Índices dentro da equipe, `from ≠ to`, fora de combate; senão `notice { code: "action-refused" }`. Aplica e envia `party`. |
| `use-item` | `item: id`, `partyIndex: 0–5` | Item na bolsa; precisa ser Potion (cura vinda dos dados do item, limitada ao HP máximo); o alvo não pode estar desmaiado nem com HP cheio; fora de combate. Aplica e envia `party` e `bag`. Outros itens: `notice { code: "item-unavailable" }`. |

## Servidor → cliente

- `entity.data.busy: boolean` no estado/delta da entidade do jogador.
- `NOTICE_CODES` ganha `menu-blocked`, `action-refused`, `item-unavailable`.
