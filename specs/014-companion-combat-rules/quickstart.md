# Quickstart: validar o spec 014

Pré-requisitos: ROM extraída, dependências instaladas.

1. **Testes**: `pnpm -r test`. Cobrem rastro, `lead`, troca, contenção no raio, blackout, perda de
   dinheiro e migração do save (SC-005, SC-006).
2. **Seguimento**: abrir o app com a equipe de dev (skill `run-soulsilver`) e andar de New Bark
   Town até Cherrygrove City entrando em todos os prédios. O companheiro não fica preso nem
   atravessa obstáculos (SC-001).
3. **Pokémon grande**: com Onix na frente, entrar e sair do Centro Pokémon de Cherrygrove. Ele volta
   para a bola e reaparece (SC-002).
4. **Reações**: interagir numa cidade, numa rota e num interior; mudar o relógio do sistema para a
   noite e repetir. A reação muda (SC-003).
5. **Combate**: apertar combate e mover. O controle chega em menos de 0,5 s (SC-004). Tentar sair do
   raio e depois recolher.
6. **Troca e blackout**: trocar pelo seletor; tentar trocar em cooldown; deixar todos desmaiarem
   contra um selvagem forte. Reaparece em casa ou no Centro e perde `maiorNível × base` (FR-021).
7. **LAN**: um segundo cliente vê o companheiro e a marca de combate do primeiro (FR-007, FR-022).

Contratos: [companion-data.md](contracts/companion-data.md),
[game-protocol-v6.md](contracts/game-protocol-v6.md), [save-v2.md](contracts/save-v2.md).
