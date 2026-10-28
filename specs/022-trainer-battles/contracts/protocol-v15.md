# Contrato: protocolo 15

`PROTOCOL_VERSION` 14 → 15. Clientes 14 são recusados com a mensagem de versão existente.

Textos (`intro`, `defeat`, `text`) são ids de texto `"0728:n"` do banco de falas de treinador; o cliente
os pagina e preenche o buffer 0 com o nome do jogador.

## Servidor → cliente

```ts
{ type: "trainerSpotted"; npcId: number; trainerId: number; tiles: number; intro?: string } // só ao jogador avistado
{ type: "trainerSay"; text: string }                                    // treinador já derrotado, ao conversar
{ type: "trainerBattleStart"; battleId: number; player: number; trainerId: number;
  arena: { area: string; x: number; y: number; radiusPx: number };
  music: "trainer" | "rival" | "leader" | "rocket" | "champion"; double: boolean } // a todos na área
{ type: "trainerSendOut"; battleId: number; slot: number; entityId: number }
{ type: "trainerItem"; battleId: number; item: number; target: number }
{ type: "trainerBattleEnd"; battleId: number; result: "won" | "lost" | "aborted";
  prize?: number; defeat?: string }                                     // prize e defeat só ao vencedor
{ type: "notice"; code: "trainer-ball" | "no-escape" | ... }
```

## Cliente → servidor

```ts
{ type: "trainer-ready" } // o jogador fechou a fala de desafio; a batalha começa (no máximo challengeTimeoutS depois)
```
