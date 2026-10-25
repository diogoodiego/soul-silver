# Quickstart: Progressão dos Pokémon

## Testes

```sh
pnpm --filter @soul-silver/shared test -- progression save
pnpm --filter @soul-silver/server test -- progression
```

Esperado:

- XP: a fórmula de [research R1](research.md#r1-fórmula-de-xp), contra selvagem e treinador, com 1 a 6 participantes, igual aos valores de referência (SC-001).
- Curvas: nível pela tabela nos níveis 1, 2, 50 e 100, com as 6 curvas (SC-002).
- Stats: 3 espécies com IVs, EVs e naturezas diferentes iguais à referência (SC-003).
- EVs: param em 255 por stat e 510 no total; quem está no nível 100 recebe EVs e não recebe XP.
- Fila: Cyndaquil nível 13 com XP para o 14 gera `level-up`, `evolve(Quilava)`; aceitar troca a espécie e cancelar mantém (SC-004).
- Nenhuma mensagem `progression` é enviada enquanto `inCombat` é verdadeiro (SC-005).
- Migração 3 → 4 e reabertura de save com `pending` não vazio (SC-006); [save-v4](contracts/save-v4.md).

## No app

Use a skill `run-soulsilver` com a equipe de dev (Cyndaquil, `game-server.ts`):

1. Ajuste o Cyndaquil para nível 13 perto do limite e derrote um selvagem na Route 29.
2. Durante a luta só aparece o aviso de XP; nenhuma tela abre.
3. Ao fim: a subida para o 14, depois a animação de evolução. Cancele e confirme que continua Cyndaquil; repita aceitando e confirme que virou Quilava.
4. Com 4 golpes, um nível com golpe novo abre a escolha; teste "não aprender" e esquecer um.
