# Contrato: API de sprites (`shared` e `extractor`)

**Feature**: [spec.md](../spec.md) | **Modelo**: [data-model.md](../data-model.md)

Tipos e schemas ficam em `shared/src/sprites/` (sem APIs do Node); a etapa e a leitura de
arquivos ficam em `extractor/src/sprites/`.

## `shared` (`@soulsilver/shared/sprites`)

```ts
export const SPRITE_FORMAT_VERSION = 1;
export const ATLAS_MAX_SIZE = 2048;

export const SPRITE_CATEGORIES = [
  'overworld-player', 'overworld-npc', 'overworld-pokemon',
  'battle', 'icon-pokemon', 'icon-item', 'trainer',
] as const;
export type SpriteCategory = (typeof SPRITE_CATEGORIES)[number];

export interface SpriteFrame {
  name: string;
  page: number;
  x: number; y: number; w: number; h: number;
  anchor: { x: number; y: number };
}

export interface AnimationStep { frame: string; ms: number; flipX: boolean }
export interface SpriteAnimation { name: string; loop: boolean; steps: AnimationStep[] }

export interface SpriteEntry {
  name: string;
  species?: number; form?: number;
  gender?: 'male' | 'female' | 'unisex';
  item?: number; trainer?: number; character?: string;
  animations: SpriteAnimation[];
  fallbackOf?: { species: number; form: number };
}

export interface SpriteSet {
  formatVersion: number;
  category: SpriteCategory;
  pages: { file: string; shinyFile?: string; width: number; height: number }[];
  frames: SpriteFrame[];
  sprites: SpriteEntry[];
}

export class SpriteFormatError extends Error {
  file: string; path: string; problem: string;     // FR-013
}

export function parseSpriteSet(json: unknown, file: string): SpriteSet;
export function parseSpriteReport(json: unknown, file: string): SpriteReport;
export function serializeSpriteFile(value: SpriteSet | SpriteReport): string;   // ordem estável
export function spriteName(category: SpriteCategory, ids: readonly (number | string)[]): string;
```

Os parsers lançam `SpriteFormatError` quando o arquivo é inválido (schema, `frame` inexistente
numa animação, retângulo fora da página, nome repetido).

## `extractor` (`packages/extractor/src/sprites/`)

```ts
export const spritesStage: Stage;        // id 'sprites', saída 'sprites'
export function buildSpriteReport(dir: string): Promise<{ ok: boolean; lines: string[] }>;
```

A etapa entra em `defaultStages`, depois de `mapsStage`. Depende das saídas `narc` e `code` da
003 e dos dados da 004 (ids de espécie, forma e item).

## CLI

- `npm run extract` roda a etapa junto das demais; o relatório de sprites vai ao final do
  relatório de sanidade, com o mesmo código de saída das outras etapas.
- `npm run sprites:view -- [sprite] [--out <pasta>]` serve a página de pré-visualização; somente
  leitura, em `127.0.0.1`, sem IPC.

## Garantias

- Mesma ROM → mesmos bytes em PNG e JSON (SC-004).
- A variante shiny usa os mesmos retângulos da normal.
- Um sprite com `fallbackOf` aparece também em `report.json`.
