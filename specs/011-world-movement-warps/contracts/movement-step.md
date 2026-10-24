# Contrato: passo de movimento (`@soulsilver/shared/game`)

```ts
stepMovement(entity: Entity, input: { move: { x: number; y: number }; run: boolean } | null,
             world: (mapId: string) => WorldMap | undefined): Entity
```

Garantias (cobertas por testes em `shared/test/game/movement.test.ts`):

1. Pura e determinística: mesma entrada, mesma saída; servidor e previsão chamam esta função.
2. Movimento livre (posição contínua, pixel a pixel), mas só nas 4 direções cardinais: o vetor de
   input é reduzido ao seu eixo dominante antes de mover (sem diagonal); velocidade =
   `min(|componente dominante|, 1) × (run ? RUN_SPEED_PX : MOVE_SPEED_PX)` por tick.
3. A caixa de pés nunca termina sobrepondo `blocked`, `water` ou borda sem vizinho; como não há
   eixo secundário, um obstáculo simplesmente para o movimento, sem deslizamento.
4. `ledge`: passa só na direção do ressalto, iniciando `hop`; durante `hop` o input é ignorado.
5. `levelTransition` sob os pés define `level = targetLevel`; colisão usa só o nível atual.
6. Pés cruzando a borda para um vizinho trocam `area` e convertem x/y.
7. Um warp com destino existente inicia `warping` quando os pés entram no tile (escadas, tapetes), quando um tile de warp sólido barra o passo (portas: os pés vão para o centro da porta) ou quando o passo é barrado com os pés sobre um warp (empurrar o tapete). Durante `warping` o input é ignorado; no meio da transição a entidade vai à âncora de destino (um tile abaixo se a âncora for sólida).
8. `world(id)` ausente = mapa aberto (mantém o comportamento de testes da 010).
