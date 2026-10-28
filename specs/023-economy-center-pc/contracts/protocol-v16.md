# Contrato: protocolo 16

`PROTOCOL_VERSION` 15 → 16. Clientes 15 são recusados com a mensagem de versão existente.

## Servidor → cliente

```ts
{ type: "shopOpen"; shopId: number; mode: "buy" | "sell"; money: number; stock: { item: number; price: number }[] }
// compra: o que as insígnias alcançam; venda: o que da bolsa é vendável, a preço de venda, reenviado após cada venda
{ type: "shopResult"; ok: boolean; reason?: "money" | "stock" | "bag-full" | "not-owned" | "unsellable" | "invalid"; money: number }
{ type: "pcOpen" }   // caixas e itens vêm na mensagem `save` que o jogador já recebe
{ type: "pcResult"; ok: boolean; reason?: "occupied" | "empty" | "last-fighter" | "full" | "invalid" }
{ type: "shopClose" } | { type: "pcClose" }
```


## Cliente → servidor

```ts
{ type: "shop-buy"; item: number; qty: number }
{ type: "shop-sell"; item: number; qty: number }
{ type: "shop-leave" }
{ type: "pc-move"; from: Slot; to: Slot }   // Slot = { where: "party"; index } | { where: "box"; box; index }
{ type: "pc-rename"; box: number; name: string }
{ type: "pc-items"; dir: "deposit" | "withdraw"; item: number; qty: number }
{ type: "pc-leave" }
```

Toda mensagem sem sessão aberta é recusada (`ok: false`). O servidor responde sempre com o saldo ou estado novo.
O aviso `storage-full` passa a significar "todas as caixas cheias".
