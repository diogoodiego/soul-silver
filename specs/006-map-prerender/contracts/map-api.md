# Contrato: API de mapas (`shared` e `extractor`)

**Feature**: [spec.md](../spec.md) | **Modelo**: [data-model.md](../data-model.md)

Este contrato define o que outros pacotes podem usar. Tipos e schemas ficam em `shared/src/maps/`
(sem APIs do Node); a etapa e a leitura de arquivos ficam em `extractor/src/maps/`.

## `shared` (`@soulsilver/shared/maps`)

```ts
export const MAP_TILE_PX = 16;          // R1
export const PIECE_TILES = 32;          // tamanho do pedaço em tiles (R0 confirma)

export type CollisionCategory =
  | 'blocked' | 'free' | 'tallGrass' | 'water'
  | 'ledge' | 'ladder' | 'levelTransition' | 'special';

export type LedgeDirection = 'north' | 'south' | 'east' | 'west';

export interface CollisionCell {
  category: CollisionCategory;
  raw: number;
  direction?: LedgeDirection;   // só em 'ledge'
  targetLevel?: number;         // só em 'levelTransition'
}

// Tradução pura de permissão original para categoria (R6).
export function classifyPermission(raw: number): CollisionCell;

// Validação no carregamento (princípio III). Erro com arquivo, caminho e problema.
export const parseMapFile, parseMapJson, serializeMapFile; // codec da 004: { file, path, problem }


// Animações de textura de um mapa (R7): schema map-animations, mapAnimation, MapAnimation.
```

Garantias:

- `classifyPermission` MUST ser total: todo inteiro vira uma célula, e valor desconhecido vira
  `special` com `raw` preservado.
- `parseMapJson` MUST rejeitar campos ausentes ou fora do enum com `{ file, path, problem }` (ver data-model, "Ajustes da implementação").

## `extractor` (`@soulsilver/extractor`)

```ts
// Etapa registrável no pipeline da 003. Depende de rom-unpack e da etapa de dados (004).
export const mapsStage: Stage;   // id: 'maps', version: 1

// Renderização pura: recebe os dados de um pedaço e devolve as duas camadas.
export function renderPiece(piece: PieceData, options: RenderOptions): PieceImages;

// Rasterizador (R3). Só triângulos com UV e textura nearest-neighbor.
export function rasterize(scene: Scene, camera: FixedCamera): RgbaImage;

// Gravação de PNG (node:zlib).
export function encodePng(image: RgbaImage): Uint8Array;
```

Erros:

- `MapExtractionError` com `mapId`, `stage` e `reason`; é capturado pela etapa e vira item de
  falha no relatório. Nunca interrompe os demais mapas (FR-013).

## Saída em disco

Conforme [data-model.md](../data-model.md) e R8:

```text
stages/maps/
├── areas.json
├── report.json
└── <mapa-id>/
    ├── header.json
    ├── layers/
    │   ├── 0-lower.png
    │   └── 0-upper.png
    └── collision/
        └── 0.json
```

## Visualizador (ferramenta de desenvolvimento)

Comando: `npm run maps:view -- <mapa-id>` (ver [quickstart.md](../quickstart.md)).

- Serve um HTML estático em `127.0.0.1` a partir de `stages/maps/`, somente leitura.
- Mostra a composição das camadas do mapa, com seletor de nível.
- Alterna camadas `lower` e `upper` (liga e desliga).
- Liga a colisão sobreposta; cada categoria tem uma cor fixa e legenda visível.
- Sem dependência de build e sem comunicação com o app (sem IPC).
