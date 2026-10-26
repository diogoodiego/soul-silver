# Contrato: protocolo do jogo v10

**Feature**: [spec.md](../spec.md)

`PROTOCOL_VERSION` 9 → 10. Única mudança:

- Entidade `pokemon` selvagem: `data.alert: true` enquanto a IA dela persegue um jogador
  (`ai === "chase"` em `server/src/wild.ts`); a chave some quando a perseguição acaba.

Nenhuma mensagem nova. O cliente deriva todos os outros sons de mensagens já existentes:

| Som | Mensagem |
|-----|----------|
| golpe | `data.used` do combatente sobe; o golpe é `data.usedMove` |
| acerto / super / pouco efetivo | `combat-event` `kind: "hit"` com `effectiveness` > 1, = 1, < 1 |
| desmaio (efeito e cry) | `data.hp` que vai a 0 numa entidade `pokemon` |
| cry ao lançar | entidade `pokemon` nova com `data.owner` de um jogador |
| arremesso | entidade nova com `data.ball` |
| balançada, captura, escape | `capture` (`shakes`, `caught`) |
| porta / warp | troca de `area` do próprio jogador |
| subida de nível, evolução | `progression` |
| vitória | `exp-gain` durante o combate |
