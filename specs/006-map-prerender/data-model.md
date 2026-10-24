# Modelo de dados: Mapas pré-renderizados e colisão

**Feature**: [spec.md](./spec.md) | **Pesquisa**: [research.md](./research.md)

Todas as entidades abaixo são arquivos de dados com schema validado por zod em `shared`
(princípio III), gravados pela etapa `maps` na área de trabalho. Os campos de identificação
usam a mesma convenção da 005 (`banco:índice`, aqui `área:índice` ou nome de mapa estável).

## MapHeader (`<mapa-id>/header.json`)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `formatVersion` | inteiro | versão do formato, 1 |
| `id` | string | identificador estável do mapa (ex.: `new-bark-town`, ou `map:<índice>` quando sem nome) |
| `name` | string | nome exibido, extraído da ROM |
| `music` | inteiro | índice da música |
| `weather` | inteiro | índice do clima |
| `areaType` | enum | `outdoor`, `indoor`, `cave` |
| `refs` | objeto | `events`, `scripts`, `encounters`: referências por índice de arquivo |
| `areaId` | string | área (matriz) a que pertence |
| `size` | `{ "tilesX": int, "tilesY": int }` | dimensão em tiles |

Regras: `tilesX` e `tilesY` MUST ser múltiplos do tamanho do pedaço (32); `areaType` MUST ser
um dos três valores; referências vazias são permitidas (lista vazia), não ausentes.

## Area (`areas.json`, um por extração)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | identificador da área |
| `width`, `height` | inteiro | tamanho da grade de pedaços |
| `grid` | matriz de índices de pedaço | pedaço em cada posição (`null` para vazio) |
| `pieceHeights` | lista | altura de cada pedaço usado na grade |
| `neighbors` | lista de `{ "direction": "north\|south\|east\|west", "areaId": string }` | vizinhos |

Regra: `grid` MUST ter `width × height` entradas; um índice fora de `pieceHeights` MUST falhar
a validação com caminho do campo.

## Piece (entrada interna da etapa; não é gravada, só alimenta a renderização)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `index` | inteiro | índice do pedaço na ROM |
| `permissions` | matriz de inteiros, 32 × 32 | valor original de permissão por tile |
| `heights` | matriz de inteiros, 32 × 32 | altura do terreno por tile |
| `buildings` | lista de `{ model, x, y, z, rotation, layer }` | prédios com posição em tiles |
| `model` | referência | modelo 3D com texturas (interna) |

## MapLayer (`layers/<nível>-<camada>.png`)

Imagem PNG RGBA, com largura `tilesX × 16` e altura `tilesY × 16`. Camada `lower` (abaixo do
jogador) ou `upper` (acima). Cada tile ocupa exatamente o bloco `(x*16, y*16)`–`(x*16+15, y*16+15)`.

## Collision (`collision/<nível>.json`)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `formatVersion` | inteiro | 1 |
| `level` | inteiro | nível (0 é o nível base) |
| `width`, `height` | inteiro | tamanho em tiles |
| `tiles` | lista de linhas, cada uma lista de célula | uma célula por tile |

Célula:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `category` | enum | `blocked`, `free`, `tallGrass`, `water`, `ledge`, `ladder`, `levelTransition`, `special` |
| `raw` | inteiro | valor original da permissão, sempre preservado |
| `direction` | enum opcional | para `ledge`: `north`, `south`, `east`, `west` |
| `targetLevel` | inteiro opcional | para `levelTransition`: nível de destino |

Regra: `raw` MUST estar presente em toda célula; `direction` só existe em `ledge`;
`targetLevel` só existe em `levelTransition`.

## MapReport (`report.json`, por extração)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `formatVersion` | inteiro | 1 |
| `maps` | lista de `{ "id", "status", "stage", "reason", "warnings" }` | um item por mapa |
| `status` | enum | `success`, `successWithWarnings`, `failure` |
| `stage` | enum opcional | etapa em que falhou: `header`, `grid`, `pieces`, `render`, `collision` |
| `reason` | string opcional | motivo legível em PT-BR (obrigatório quando `status` é `failure`) |
| `warnings` | lista de `{ "code", "detail" }` | `animated-texture`, `unknown-permission`, `ambiguous-height` |

Regras: `reason` MUST estar presente em toda falha; `warnings` MUST estar presente em
`successWithWarnings`; a lista `maps` MUST ter um item por mapa presente na ROM.

## Relações

- `MapHeader` referencia uma `Area` pelo `areaId`.
- `Area.grid` referencia pedaços (`Piece`) pelo índice.
- Cada `MapHeader` tem uma ou mais `MapLayer` e uma `Collision` por nível.
- `Collision` com `levelTransition` referencia outro nível do mesmo mapa.
- `MapReport` tem um item por mapa, com o `id` do `MapHeader`.

## Transições de estado de um mapa na etapa

`pending` → `headerRead` → `gridRead` → `piecesRead` → `rendered` → `collided` → `written`
(sucesso). Qualquer transição pode ir para `failure` com `stage` e `reason`. Um mapa com aviso
termina em `written` com `successWithWarnings` no relatório.

## Ajustes da implementação

Feitos ao implementar os schemas (T009), para seguir o código existente das features 004 e 005:

- **Envelope e erros**: os arquivos usam o envelope `kind` + `formatVersion` + `records` (ids
  crescentes) e o codec `createGameDataCodec`, que devolve `{ file, path, problem }`. Não há
  `MapFormatError` próprio.
- **Headers num arquivo só**: `map-headers.json` com um registro por zona (540), em vez de um
  `header.json` por mapa. O nome é `mapsec`, índice no banco de texto `map-names` (005).
- **Área = matriz**: `map-areas.json` tem um registro por matriz, com as grades `pieces`, `heights`
  e `maps` (header por célula). Uma matriz contém vários mapas (a principal tem 47 × 17 células),
  então os vizinhos de um mapa são derivados da grade `maps`, não gravados à parte.
- **Colisão**: `map-collision`, um arquivo por mapa e nível, com `tiles` em ordem de linha.
- **Animações**: `animations.json` por mapa (só os mapas que desenham um material animado), com as animações
  desses materiais: `scroll` (5 trilhas, constantes ou por quadro) ou `pattern` (quadros-chave com nomes
  de textura e paleta). Schema `map-animations` em `shared/src/maps/animations.ts`. A reprodução é do overworld.
- **Quadros da animação**: `animations.json` também traz `frames` (8) e `regions`: caixas em pixels, alinhadas aos tiles,
  por nível e camada. Cada região tem `frames` imagens `layers/{nível}-{camada}-anim-{k}.png`, cortadas da região, em que o
  ciclo de cada animação é reamostrado (k = 0..7 de um ciclo). Uma animação sem diferença visível não gera região.
