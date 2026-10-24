# Contrato: protocolo v3 (delta sobre a v2 da spec 010)

`PROTOCOL_VERSION`: 2 → 3. O handshake recusa cliente v2 (comportamento da 010).

## Cliente → servidor

```jsonc
{ "type": "input", "seq": 42, "move": { "x": 0.71, "y": -0.71 }, "run": false }
```

- `dir` removido. `move` com eixo fora de [-1, 1] ou não finito: mensagem malformada (regra da 010).
- Módulo > 1 é normalizado pelo servidor, não rejeitado.

## Servidor → cliente

Entidades e deltas ganham `level` (int ≥ 0). `data.hop` e `data.warping` trafegam no `data`
existente. Nenhuma mensagem nova: o cliente desenha o fade enquanto `data.warping > 0` do próprio
jogador e troca o mapa desenhado quando `area` muda.
