# Quickstart: validar o spec 015

Pré-requisitos: ROM extraída, dependências instaladas.

1. **Testes**: `pnpm -r test`. Cobrem sorteio da Route 29 em 1.000 spawns por horário com
   qui-quadrado (SC-001, SC-002), posição fora da visão (SC-005), fórmula de captura por bola,
   status e HP (SC-003), disputa de acerto e migração do save 2 → 3.
2. **Spawn**: abrir o app com a flag de dev (skill `run-soulsilver`) e ir à Route 29. Selvagens
   aparecem na grama fora da tela e somem ao se afastar (FR-005, FR-006).
3. **Horário**: mudar o relógio do Windows para 21h e reentrar no mapa. Aparece Hoothoot e nenhum
   exclusivo do dia (SC-002).
4. **Temperamentos**: aproximar de um arisco, de um agressivo e de um territorial (ids em
   [wild-data.md](contracts/wild-data.md)); puxar um agressivo além do `leashTiles` (FR-010, FR-011).
5. **Captura**: com 20 Poké Balls da flag de dev, enfraquecer e arremessar. Ver as balançadas, o
   aviso de equipe cheia e a entrada no armazenamento (SC-006, FR-018).
6. **LAN**: segundo cliente no mesmo mapa vê os mesmos selvagens e a captura do outro; arremessos
   simultâneos devolvem a bola de quem perdeu (SC-004, FR-017).

Contratos: [wild-data.md](contracts/wild-data.md), [game-protocol-v7.md](contracts/game-protocol-v7.md),
[save-v3.md](contracts/save-v3.md).
