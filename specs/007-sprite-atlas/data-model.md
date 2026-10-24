# Modelo de dados: Sprites

**Feature**: [spec.md](./spec.md) | **Plano**: [plan.md](./plan.md) | **Pesquisa**: [research.md](./research.md)

Todos os arquivos ficam em `stages/sprites/sprites/` e têm `formatVersion` (princípio VI). Os
tipos e schemas vivem em `shared/src/sprites/`.

## Layout de saída

```text
sprites/
├── <categoria>.json              # SpriteSet
├── <categoria>-<página>.png      # atlas normal
├── <categoria>-<página>-shiny.png  # só quando a categoria tem shiny (battle, overworld-pokemon)
└── report.json                   # SpriteReport
```

Categorias: `overworld-player`, `overworld-npc`, `overworld-pokemon`, `battle`, `icon-pokemon`,
`icon-item`, `trainer`.

## SpriteSet (`<categoria>.json`)

| Campo | Tipo | Regra |
|-------|------|-------|
| `formatVersion` | int | `SPRITE_FORMAT_VERSION` |
| `category` | enum | uma das categorias acima |
| `pages` | `{ file, shinyFile?, width, height }[]` | largura e altura ≤ 2048; `shinyFile` só quando há shiny |
| `frames` | `Frame[]` | ordenados pelo nome; nomes únicos |
| `sprites` | `Sprite[]` | ordenados pelo nome |

### Frame

| Campo | Tipo | Regra |
|-------|------|-------|
| `name` | string | `<categoria>/<ids>/<quadro>`, único; ids vêm da 004 |
| `page` | int | índice em `pages` |
| `x`, `y`, `w`, `h` | int | dentro da página, w e h ≥ 1 |
| `anchor` | `{ x, y }` | pixel do quadro sobre o ponto de ancoragem ("pé"); dentro do quadro ou até 1 quadro fora, para sprites com sombra |

### Animation

| Campo | Tipo | Regra |
|-------|------|-------|
| `name` | string | por exemplo `walk-down`, `idle-left`, `run-up` |
| `loop` | boolean | |
| `steps` | `{ frame, ms, flipX }[]` | `frame` existe em `frames`; ms ≥ 1; flipX `true` quando espelhado |

### Sprite

| Campo | Tipo | Regra |
|-------|------|-------|
| `name` | string | igual ao prefixo dos quadros do sprite |
| `species`, `form` | int? | ids da 004, só em Pokémon |
| `gender` | `male \| female \| unisex`? | `unisex` quando o original não diferencia; os dois gêneros apontam para os mesmos quadros |
| `item` | int? | id da 004, só em ícones de item |
| `trainer` | int? | índice original do sprite de treinador |
| `character` | string? | `player-<n>` ou `npc-<id original>` no overworld |
| `animations` | `Animation[]` | vazio para imagens estáticas |
| `fallbackOf` | `{ species, form }`? | presente quando o sprite usa o da forma base |

## SpriteReport (`report.json`)

| Campo | Tipo | Regra |
|-------|------|-------|
| `formatVersion` | int | |
| `categories` | `Record<categoria, { sprites, frames, animations, pages }>` | contagens |
| `missing` | `{ category, sprite, frame?, reason }[]` | quadros ou paletas faltando |
| `fallbacks` | `{ species, form, usedForm }[]` | substituições por forma base |
| `failed` | `{ category, sprite, reason }[]` | sprites não extraídos |
| `ok` | boolean | `false` se algum dos 493 Pokémon perdeu sprite ou a perda passou do limite (R5) |

## Relações

- `Sprite.species`/`form` → `Species`/`Form` da 004; `item` → `Item` da 004.
- `Animation.steps[].frame` → `Frame.name` do mesmo `SpriteSet`.
- `Frame.page` → `pages[i]`; a variante shiny usa o mesmo retângulo no `shinyFile`.

## Transições de estado de um sprite na etapa

`lido` → `decodificado` (tiles + paleta) → `empacotado` (retângulo no atlas) → `descrito`
(metadados e animações). Qualquer passo que falhe move o sprite para `failed` no relatório, e os
demais seguem.
