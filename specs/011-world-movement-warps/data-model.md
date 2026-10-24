# Data Model: Mundo, movimento e warps

## PlayerInput (protocolo v3, substitui `dir`)

| Campo | Tipo | Regra |
|---|---|---|
| `seq` | int ≥ 0 | como na 010 |
| `move` | `{ x: number, y: number }` | cada eixo em [-1, 1], módulo ≤ 1 (normalizado se maior); só o eixo dominante move a entidade (4 direções, sem diagonal) |
| `run` | boolean | |

## Entity (acréscimos)

| Campo | Tipo | Regra |
|---|---|---|
| `level` | int ≥ 0 | nível de colisão e desenho; default 0 |
| `data.hop` | int 0–7 | ticks restantes de pulo de ressalto (7 × 4 px); ausente = no chão |
| `data.warping` | int 0–12 | ticks restantes de transição; > 0 descarta input; ausente = parado |

`area`, `x`, `y`, `facing` seguem a 010. `facing` passa a ser a direção cardinal dominante do vetor.

## WorldMap (`shared/src/game/world-map.ts`)

| Campo | Tipo | Origem |
|---|---|---|
| `id` | string | id do mapa |
| `levels` | `CollisionMap[]` | `collision/<nível>.json` (006) |
| `warps` | `{ tx, ty, destMap, destAnchor }[]` | eventos do mapa (008) |
| `neighbors` | `{ map, dx, dy }[]` | `mapNeighbors` + `mapCells` (matriz); deslocamento em px |
| `widthPx`, `heightPx` | int | largura/altura × `MAP_TILE_PX` |

Validação: arquivos passam pelos schemas zod existentes ao carregar. Todos os warps são mantidos,
porque `destAnchor` é índice nessa lista; um warp cujo destino não existe é registrado em log e o
passo de movimento nunca o inicia. O mapa 0 (placeholder das células sem mapa na matriz) não é vizinho.
Warp com `destMap` 4095 é o "voltar de onde veio" do HGSS: fora do escopo (só aparece além do percurso).

## Transições de estado do jogador

```text
andando ──(pés entram num tile de warp, ou empurra um warp sólido, ou empurra parede sobre um warp)──▶ warping(12) ──(tick 6: muda área/posição)──▶ warping ──(0)──▶ andando
andando ──(entra em ledge na direção certa)──▶ hop(7) ──(0)──▶ andando (tile após o ressalto)
andando ──(pés em levelTransition)──▶ andando com level = targetLevel
andando ──(pés cruzam borda com vizinho)──▶ andando em area = vizinho, x/y −= deslocamento
```

Chegada: no centro do tile âncora; se a âncora é sólida (porta vista de fora), um tile abaixo, virado para o sul.

Se após correção ou warp a caixa de pés estiver dentro de sólido, a entidade vai ao centro do
tile livre mais próximo (busca em espiral, raio ≤ 4 tiles).
