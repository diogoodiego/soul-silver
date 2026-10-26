# Contrato: protocolo de jogo v11

`PROTOCOL_VERSION` 10 → 11 (`packages/shared/src/protocol-version.ts`). Apps de versões diferentes
recusam a conexão com a mensagem clara de sempre. Nenhuma mudança de save nem de mensagens existentes.

## Cliente → servidor

```json
{ "type": "debugAi", "on": true }
```

Liga ou desliga o envio de `aiDebug` para aquele cliente. Padrão: desligado a cada conexão.

## Servidor → cliente

```json
{
  "type": "aiDebug",
  "tick": 1200,
  "ais": [
    {
      "entityId": 41,
      "state": "combat",
      "target": 3,
      "sight": { "rangePx": 80, "angleDeg": 110, "facing": { "x": 1, "y": 0 } },
      "lastSeen": { "x": 512, "y": 300 },
      "zone": { "x": 480, "y": 288, "radiusPx": 160 },
      "scores": [{ "slot": 0, "move": 52, "damage": 11.2, "hit": 0.8, "utility": 0, "score": 9.0 }],
      "chosenSlot": 0
    }
  ]
}
```

- Enviado a 4 Hz, só a clientes com `debugAi` ligado, só com IAs da área do jogador a ≤ 20 tiles.
- `target`, `lastSeen` e `chosenSlot` são opcionais (`null` quando não há).
- Tipos zod em `packages/shared/src/game/protocol.ts` (`aiDebug`, `debugAi`), junto de `debug`.
- Mensagem malformada de `debugAi` é rejeitada como as demais (`malformed.test.ts`).

## Sem mudança

`alert` em `Entity.data` (o "!") continua sendo o sinal do cliente; passa a ser ligado pelo estado
Alerta, por `alertS` segundos em `tuning.json`.
