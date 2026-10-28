# Data Model

## Save v7 (muda em relação ao v6)
- **removido** `storage`.
- **`boxes`**: lista de 18 (`BOX_COUNT` em `shared/save`) `{ name: string(1..8), slots: (PartyMember | null)[30] }`.
- **`pcItems`**: `{ item, count 1..999 }[]`, máx. 50, item único.
- `money` (0..999999), `respawn` e `bag` já existem; `respawn` passa a mudar só pela cura.
- Migração 6 → 7: `boxes` com nomes padrão; `storage[i]` → `boxes[0].slots[i]`; `pcItems: []`.

## Shop (extraído, `shops.json`)
- `records`: `{ id, items: { item, minBadges }[] }[]`; id 0 é o Poké Mart comum, id n + 1 a loja especial n.
- Regras: o item existe em `items.json`; `minBadges` 0..16.

## Sessões (memória do servidor, não persistidas)
- **ShopSession**: `{ player, shopId }`; fecha ao sair, desconectar, entrar em batalha ou warp.
- **PcSession**: `{ player }`, mesmas condições de fechamento.

## Validações
| Operação | Recusa quando |
|----------|---------------|
| buy | item fora do estoque do jogador; qty < 1 ou > 99; dinheiro < qty × preço; sem espaço na bolsa |
| sell | item ausente ou qty maior que a possuída; sem preço ou key-item |
| box move | origem vazia ou inexistente; destino ocupado ou inexistente; deixaria a equipe sem Pokémon apto |
| box rename | caixa inexistente; nome vazio ou > 8 |
| item deposit/withdraw | quantidade acima da posse; depósito cheio; sem espaço na bolsa |
