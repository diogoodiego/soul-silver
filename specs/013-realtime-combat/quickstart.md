# Quickstart: Combate em tempo real

## Pré-requisitos

- Assets extraídos (features 003–008). `npm install` na raiz.
- Build de desenvolvimento (a arena não existe em produção).

## Testes automatizados

```sh
npm test -w @soulsilver/shared   # dano Gen 4, tabela de tipos inteira, stats, estágios, status, cooldown, Speed, hitbox, schemas
npm test -w @soulsilver/server   # resolução por tick, dono/fogo amigo, mira autoritativa, cobertura do mapeamento
npx tsx scripts/combat-coverage.ts <extração>   # regrava content/combat/coverage.json; diff vazio = atualizado
```

## Cenários manuais (arena)

| # | Passos | Esperado | Cobre |
|---|--------|----------|-------|
| 1 | Arena: Cyndaquil Nv 10 (Ember) vs Chikorita Nv 10 parada; acertar Ember | "super efetivo"; dano ≈ 2× do Ember contra Sentret no mesmo nível (HUD mostra o valor) | SC-003, US2 |
| 2 | Disparar Ember mirando longe do alvo | projétil passa; HP intacto | US1 |
| 3 | Tackle vs Gastly | "sem efeito", dano 0, sem knockback | US2 |
| 4 | Usar os 4 atalhos (teclado e controle) com mouse e analógico direito | cada golpe sai no arquétipo; HUD mostra cooldowns | US1 |
| 5 | Comparar Rattata e Hoothoot andando e usando Tackle | o mais rápido anda mais e volta antes | US3 |
| 6 | Ember até queimar; Sleep Powder; Supersonic | HUD mostra status e duração; efeitos de cada um | US4 |
| 7 | Swords Dance e depois Scratch | dano físico maior (estágio +2 no HUD) | US4 |
| 8 | Mudar `rangePx` de Ember em `content/combat/moves.json`, reiniciar a arena | novo alcance | US5, SC-006 |
| 9 | Colocar `"archetype": "nope"` num golpe | servidor recusa com arquivo e campo | US5 |
| 10 | Sessão hospedada com 2 jogadores, Pokémon um no outro | sem dano | FR-012 |

Após ajustes de número, conferir `docs/balance-log.md` (SC-007).
