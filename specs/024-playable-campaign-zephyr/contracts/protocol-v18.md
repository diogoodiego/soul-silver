# Contrato: protocolo v18 (17 → 18)

Clientes de versão diferente recusam a conexão (princípio VI). A única mudança é a forma do `hello.arena`, a arena de testes de desenvolvimento.

## Arena de testes

`hello.arena` (só aceito pelo servidor iniciado com `--dev-arena`, isto é, com o app não empacotado):

```ts
{
  trainer: { name: string /* 1..PLAYER_NAME_MAX, sem espaços nas pontas */, character: "male" | "female" },
  team: ArenaCombatant[] /* 1..6 */,
  foe:
    | { kind: "wild", behavior: "ai" | "idle", team: ArenaCombatant[] /* 1..6 */ }
    | { kind: "trainer", trainer: number /* id em trainers.json */, team: ArenaCombatant[] /* 1..6 */ },
}
// ArenaCombatant = { species, level: 1..100, moves: id[1..4] }
```

- O jogador entra como o próprio treinador (`trainer`), com `team` como equipe (IVs 31, EVs 0, natureza 0, HP cheio), num campo aberto (`area: "arena"`, 24×16 tiles livres). Nada é salvo. Ao perder, volta ao campo da arena.
- `foe.kind = "wild"`: os Pokémon ficam a leste do jogador. `behavior: "ai"` usa a IA de selvagens (spec 019); `"idle"` deixa-os parados como alvo. Não há treinador.
- `foe.kind = "trainer"`: a luta com o treinador `trainer` começa ao entrar, com `team` no lugar do time original (golpes como dados; dificuldade 255, isto é, IVs 31).
- `reject` com `invalid-message`: fora do servidor de desenvolvimento, espécie ou golpe inexistente, treinador inexistente, selvagens com IA sem dados de selvagens, ou luta de treinador sem dados de treinadores e scripts. Nesses casos nada entra no mundo.
- Um cliente v17 (arena `{ a, b }`) recebe `reject` com `protocol-mismatch`.

Implementação: `packages/shared/src/game/protocol.ts` (`arenaSpec`), `packages/server/src/arena.ts`, `session.ts` (`arenaProblem`, `spawnFoes`), `wild.ts` (`place`), `trainer-battle.ts` (`startScripted` com time substituto), `packages/client/src/ArenaSetup.svelte`. Testes: `packages/server/test/arena.test.ts`, `packages/shared/test/game/protocol.test.ts`, `packages/client/test/net/game-connection.test.ts`.
