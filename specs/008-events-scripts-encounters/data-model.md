# Modelo de dados: Eventos, scripts, encontros e treinadores

**Feature**: [spec.md](./spec.md) | **Plano**: [plan.md](./plan.md) | **Pesquisa**: [research.md](./research.md)

Todos os arquivos ficam em `stages/events/events/`, têm `kind` e `formatVersion` (princípio VI) e
usam o envelope e o codec da 004. Os tipos e schemas vivem em `shared/src/events/schemas.ts`.

## Layout de saída

```text
events/
├── maps/<id>.json          # map-events, um por mapa (id do cabeçalho, 4 dígitos)
├── scripts/<arquivo>.json  # script-file, um por arquivo de script com tabela (4 dígitos)
├── encounters.json         # encounters, um registro por banco de encontro
├── headbutt.json           # headbutt, um registro por mapa com árvores
├── trainers.json           # trainers, um registro por treinador com Pokémon
└── report.json             # events-report
```

## Referência de script (`ScriptRef`)

`{ id, file, entry }`: `id` é o valor guardado no evento, `file` o arquivo de script e `entry` o
índice do script nesse arquivo, já resolvidos pela regra do jogo (research.md R0). Um evento sem
script (id 0 ou 0xFFFF) tem `script: null`.

## map-events (`maps/<id>.json`)

| Campo | Tipo | Regra |
|-------|------|-------|
| `map` | id | id do mapa (006) |
| `npcs` | `Npc[]` | ordem do original |
| `warps` | `Warp[]` | ordem do original |
| `triggers` | `Trigger[]` | ordem do original |
| `signs` | `Sign[]` | placas e interações de fundo, ordem do original |
| `levelScripts` | `LevelScripts` | scripts de carga do mapa |

**Npc**: `id`, `sprite`, `movement`, `type`, `hideFlag`, `script` (`ScriptRef` ou nulo), `facing`
(s16), `param` (3 × u16), `xRange`, `yRange` (s16), `x`, `z` (u16), `y` (s32), `trainer` (id ou
nulo, quando o id de script é de treinador). `hideFlag` é a flag que esconde o objeto quando
ligada; 0 significa sempre visível (princípio VII: o servidor decide por jogador).

**Warp**: `x`, `z`, `destMap`, `destAnchor`, `y`.

**Trigger** (gatilho de posição): `script`, `x`, `z` (s16), `w`, `h`, `y`, `variable`, `value`. O
gatilho dispara quando a variável `variable` vale `value` (a condição).

**Sign**: `script`, `kind`, `x`, `z`, `y` (s32), `dir`.

**LevelScripts**: `onTransition`, `onResume`, `onLoad` (`ScriptRef` ou nulo) e `frames`: lista de
`{ variable, value, script }` que roda `script` quando `variable` é igual a `value` (constante, ou
variável quando `value` ≥ 0x4000).

## script-file (`scripts/<arquivo>.json`)

| Campo | Tipo | Regra |
|-------|------|-------|
| `file` | id | arquivo de script |
| `messageBank` | id ou nulo | banco de mensagens (005) do texto; nulo se nenhum mapa nem faixa usa o arquivo |
| `entries` | string[] | rótulo de cada script do arquivo, na ordem da tabela; cada um existe em `labels` |
| `code` | `Command[]` | comandos alcançáveis, em ordem de endereço |
| `labels` | `Record<string, id>` | rótulo → posição em `code`, menor que `code.length` |
| `movements` | `Record<string, Step[]>` | sequências de movimento por rótulo `M<n>` |
| `unreachableBytes` | id | bytes que nenhuma entrada alcança, não decodificados |
| `partial` | boolean | verdadeiro se a decodificação parou num comando desconhecido |

**Command**: `{ name, args }` com `args` por nome da tabela de comandos, ou `{ raw: true, id }` para
um id fora da tabela, na posição original (FR-007). Todo destino `label` e `movement` de um argumento
existe em `labels` e `movements`.

**Value** (argumento): número; `{ text: "BBBB:I" }` (identificador da 005); `{ species }`, `{ move }`,
`{ item }`, `{ trainer }`; `{ flag }`; `{ variable }` (também no lugar de espécie, golpe, item,
treinador e texto quando o valor é ≥ 0x4000); `{ label }`; `{ movement }`.

**Step**: `{ action, count }`, com o nome da ação da tabela (`movement_<id>` se faltar).

## encounters (`encounters.json`)

`records` por banco de encontro (`id` crescente = membro de `a/0/3/7`); o mapa aponta para o banco
por `refs.encounters` em `map-headers.json` (006).

| Campo | Tipo | Regra |
|-------|------|-------|
| `rates` | objeto | `walking`, `surfing`, `rockSmash`, `oldRod`, `goodRod`, `superRod`: 0 a 255, como guardados |
| `grass` | `{ morning, day, night }` | 12 espaços por horário; ausente se nenhum tem espécie |
| `surf`, `rockSmash`, `oldRod`, `goodRod`, `superRod` | `Slot[]` | 5 espaços (2 no Rock Smash); ausente se nenhum tem espécie |
| `sounds` | `{ hoenn, sinnoh }` | espécies dos programas de rádio; ausente se vazio |
| `swarm` | `{ grass, surf, fish }` | espécies do enxame; ausente se vazio |
| `nightFish` | u16 | espécie que entra na pesca à noite; ausente se 0 |

**Slot**: `species` (0 a 1023), `form` (0 a 63), `minLevel`, `maxLevel` (0 a 100, `minLevel` não passa
de `maxLevel`), `chance` (1 a 100, percentual do espaço pela ordem do jogo).

## headbutt (`headbutt.json`)

`records` por mapa (`id` crescente) com `common`, `rare`, `secret` (`Slot[]`, vazio se sem espécie),
`regularTrees` e `secretTrees` (grupos de coordenadas `[x, z]` em s16; o preenchimento 0xFFFF não
sai). Mapas sem árvores não aparecem.

## trainers (`trainers.json`)

| Campo | Tipo | Regra |
|-------|------|-------|
| `id` | id | índice do treinador (o 0, vazio, não sai) |
| `class` | `{ id: 0 a 255, text }` | `text` = identificador da 005 do nome da classe (banco 730) |
| `name` | string | identificador da 005 do nome (banco 729) |
| `items` | id[] | até 4 itens de batalha, sem os zeros |
| `aiFlags` | 0 a 2³²−1 | máscara de IA como guardada |
| `doubleBattle` | boolean | |
| `team` | `TeamMember[]` | de 1 a 6, na ordem do original |

**TeamMember**: `difficulty`, `genderOverride` (0 a 15), `abilityOverride` (0 a 15), `level` (1 a 100),
`species`, `form`, `item` (id ou nulo), `moves` (4 ids, ou nulo quando o original usa os golpes
padrão do nível), `capsule`.

## script-commands (`packages/extractor/data/script-commands.json`)

`commands`: `{ id, name, args: { name, type, size, when? }[] }` com `type` em `number`, `text`,
`species`, `move`, `item`, `trainer`, `flag`, `variable`, `jump`, `movement`, `size` 1, 2 ou 4
bytes e `when` opcional `{ arg, in? | notIn? }` para argumentos condicionais. `movements`:
`{ id, name }`. Ids de comando e de movimento são únicos.

## events-report (`report.json`)

| Campo | Tipo | Regra |
|-------|------|-------|
| `ok` | boolean | falso se mais de 2% dos arquivos de script se perderam |
| `counts` | objeto | `maps`, `npcs`, `warps`, `triggers`, `signs`, `scriptFiles`, `scripts`, `commands`, `encounterBanks`, `trainers` |
| `commands` | `Coverage[]` | comandos da tabela que aparecem, do mais frequente ao menos, empate por nome |
| `unknownCommands` | `Coverage[]` | comandos mantidos como `raw:<id>` |
| `undecodedScripts` | `{ file, reason }[]` | arquivos de script perdidos ou parados num desconhecido |
| `unresolved` | `{ file, kind, detail }[]` | referências sem destino (texto, espécie, golpe, item, treinador, entrada de script, banco de mensagens) |
| `unreachableBytes` | id | soma dos bytes que nenhuma entrada alcança |
| `decodedPercent` | 0 a 100 | arquivos de script decodificados por inteiro sobre o total |

**Coverage**: `{ name, count, maps, globalFiles }`: ocorrências, mapas cujo arquivo de script tem o
comando (crescente) e arquivos compartilhados (sem mapa) que o têm.

## Transições de estado

Nenhuma: os arquivos são produzidos de uma vez pela etapa e só lidos depois.
