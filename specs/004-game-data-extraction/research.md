# Research: Dados do jogo

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-23

Os formatos abaixo foram conferidos com a extração local da ROM real (SHA-1
`f8dc38ea…`, feature 003, quickstart §3), decodificando registros conhecidos: Charizard, Deoxys,
Eevee, Bulbasaur, Lança-chamas, Poké Ball, Potion. Nenhum dado da ROM foi copiado para o
repositório. Este documento registra só a estrutura, os offsets e algumas contagens públicas.

Cada item segue o formato Decisão / Motivo / Alternativas. Nenhum `NEEDS CLARIFICATION` ficou
aberto.

---

## R1. Onde está cada dado

**Decisão**: as etapas leem as seguintes fontes (caminhos relativos às saídas da etapa
`rom-unpack` e da nova etapa `code-decompress`, R2):

| Dado | Fonte | Formato |
|------|-------|---------|
| Espécies e formas (personal) | `narc/a/0/0/2/NNNN.bin`, 508 membros × 44 bytes | R3 |
| Golpes | `narc/a/0/1/1/NNNN.bin`, 471 membros × 16 bytes | R4 |
| Learnset por nível | `narc/a/0/3/3/NNNN.bin`, 508 membros | R5 |
| Evoluções | `narc/a/0/3/4/NNNN.bin`, 508 membros × 44 bytes | R6 |
| Golpes de ovo | `narc/a/2/2/9/0000.bin`, 1 membro | R5 |
| Itens (dados) | `narc/a/0/1/7/NNNN.bin`, 514 membros × 34 bytes | R7 |
| Item → índice de dados | ARM9 descomprimido, `0x100194`, 537 × 8 bytes | R7 |
| Curvas de experiência | `narc/a/0/0/3/NNNN.bin`, 8 membros × 404 bytes | R8 |
| Tabela de TMs/HMs | ARM9 descomprimido, `0x1000cc`, 100 × u16 | R5 |
| Compatibilidade com tutores | `filesystem/fielddata/wazaoshie/waza_oshie.bin`, 505 × 8 bytes | R5 |
| Lista de tutores | overlay 1 descomprimido, `0x23ae0`, 52 × 4 bytes | R5 |
| Tabela de tipos | overlay 12 descomprimido, `0x353bc` | R8 |
| Naturezas | ARM9 descomprimido, `0xff639`, 25 × 5 s8 | R8 |
| Quantidade de habilidades | `narc/a/0/2/7/0720.bin`, contador u16 do cabeçalho | R9 |

Os offsets ficam numa constante de layout, `SOULSILVER_US_LAYOUT` (R10). O índice do membro de
personal, learnset e evolução é o **índice personal**: 1–493 são espécies, 494 e 495 são o Ovo e
o Ovo ruim (ignorados) e 496–507 são as formas (R3).

**Motivo**: a ROM aceita é uma só, travada por hash (feature 003). Offsets fixos são o caminho
mais simples, e cada tabela tem uma checagem estrutural que falha alto se o offset estiver errado
(R10).

**Alternativas**: localizar tabelas por busca de padrões em tempo de extração (mais frágil,
exige guardar "âncoras" de dados no código e não ganha nada com uma única ROM); usar os
arquivos da decomp `pokeheartgold` (dependência externa e licença incerta).

## R2. Descompressão de código (BLZ)

**Decisão**: nova etapa `code-decompress` (v1). Ela descomprime o ARM9 e os overlays do ARM9 com
BLZ (*backward LZ* do SDK do DS) e grava `code/arm9.bin` e `code/overlay9/NNNN.bin`.

- **ARM9**: os *module params* estão no lugar dos bytes `21 06 C0 DE DE C0 06 21` menos `0x1C`.
  `compressedStaticEnd` (params + `0x14`) é um endereço de RAM, e o offset no arquivo é esse
  endereço menos o endereço de carga do ARM9 (cabeçalho `0x28`). A região `[0, fim)` é
  descomprimida, e o resto é copiado como está. Se `compressedStaticEnd` for 0, o ARM9 não está
  comprimido.
- **Overlays**: comprimidos quando o bit 24 da palavra em `0x1C` da entrada na tabela y9 está
  ligado (127 de 129 overlays). O arquivo inteiro é BLZ.
- **Formato BLZ**: os últimos 8 bytes são `u32` (tamanho comprimido nos 24 bits baixos, tamanho
  do cabeçalho nos 8 altos) e `u32` (bytes extras após descomprimir). A descompressão anda de trás
  para frente. Cada byte de flags cobre 8 itens, e cada item é um literal ou um par
  `(len = (b >> 12) + 3, disp = (b & 0xFFF) + 3)`.

Conferido: o ARM9 vai de 762.648 para 1.122.040 bytes, e as tabelas de R1 aparecem nos offsets
indicados.

**Motivo**: naturezas, TMs, mapeamento de itens, tutores e tabela de tipos estão no código, não
em NARCs. Ter uma etapa própria deixa a descompressão versionada e reaproveitável pelos specs 5
a 9 (scripts e treinadores também estão em overlays).

**Alternativas**: descomprimir dentro de cada etapa de dados (repetido e mais lento);
ferramentas externas como `ndstool` ou `blz` (ferem "Node puro").

## R3. Personal (espécies e formas), 44 bytes

**Decisão**:

| Offset | Tam. | Campo |
|--------|------|-------|
| 0x00 | 6 × u8 | stats base na ordem **PS, Atq, Def, Vel, AtqE, DefE** |
| 0x06 | 2 × u8 | tipos (iguais quando o tipo é único) |
| 0x08 | u8 | taxa de captura |
| 0x09 | u8 | experiência base |
| 0x0A | u16 | EVs: 2 bits por stat, na mesma ordem dos stats |
| 0x0C | 2 × u16 | item segurado comum e raro (0 = nenhum) |
| 0x10 | u8 | gênero: 0 = só macho, 254 = só fêmea, 255 = sem gênero, outros = proporção de fêmea/254 |
| 0x11 | u8 | ciclos de eclosão |
| 0x12 | u8 | amizade base |
| 0x13 | u8 | grupo de crescimento (0–5) |
| 0x14 | 2 × u8 | grupos de ovo (iguais quando é um só) |
| 0x16 | 2 × u8 | habilidades (0 = sem segunda) |
| 0x18 | u8 | taxa de fuga na Safari |
| 0x19 | u8 | cor (bits 0–6) e flag de flip (bit 7) |
| 0x1A | u16 | (padding) |
| 0x1C | 16 bytes | compatibilidade com TM/HM: bit *k* = máquina *k*+1 (TM01–TM92, HM01–HM08 nos bits 92–99) |

Conferido com Charizard: 78/84/78/100/109/85, Fogo/Voador, captura 45, exp. 209, 3 EVs de AtqE,
proporção 31, grupo 3, ovos Monstro/Dragão, Blaze.

Formas (índice personal → espécie, forma), conferidas por stats e tipos:

| Índice | Espécie | Forma |
|--------|---------|-------|
| 496, 497, 498 | 386 Deoxys | 1 Ataque, 2 Defesa, 3 Velocidade |
| 499, 500 | 413 Wormadam | 1 Areia, 2 Lixo |
| 501 | 487 Giratina | 1 Origem |
| 502 | 492 Shaymin | 1 Céu |
| 503 a 507 | 479 Rotom | 1 Calor, 2 Lavagem, 3 Gelo, 4 Ventilador, 5 Corte |

Esse mapeamento é de identidade (qual registro é qual forma), não um dado de jogo, e fica na
constante de layout. Hatch cycles, amizade, cor e taxa de fuga também são extraídos, porque já
estão no mesmo registro e servem a specs futuros.

**Alternativas**: só extrair os campos pedidos (exigiria uma reextração quando os outros forem
necessários).

## R4. Golpes, 16 bytes

**Decisão**:

| Offset | Tam. | Campo |
|--------|------|-------|
| 0x00 | u16 | identificador original de efeito |
| 0x02 | u8 | categoria: 0 físico, 1 especial, 2 status |
| 0x03 | u8 | poder (0 = sem dano; 1 = poder variável/calculado) |
| 0x04 | u8 | tipo |
| 0x05 | u8 | precisão (0 = sem checagem de precisão) |
| 0x06 | u8 | PP |
| 0x07 | u8 | chance do efeito secundário (%) |
| 0x08 | u16 | alvo (bitfield, R11) |
| 0x0A | s8 | prioridade |
| 0x0B | u8 | flags (R11) |
| 0x0C | u8 | efeito de concurso |
| 0x0D | u8 | tipo de concurso |
| 0x0E | u16 | padding |

O NARC tem 471 membros: 0 é "nenhum", 1–467 são os golpes, e 468–470 são entradas sem nome que o
jogo não usa (o banco de nomes tem 468 entradas). A etapa extrai só 1–467. As entradas 468–470
aparecem no relatório como "ignoradas".

Conferido com Pound (40/100/35, flags `0x73`) e Lança-chamas (efeito 4, especial, 95, Fogo, 100,
15, 10%).

## R5. Learnsets, TM/HM, ovo e tutores

**Decisão**:

- **Por nível** (`a/0/3/3`, índice personal): sequência de `u16 = (nível << 9) | golpe`,
  terminada por `0xFFFF`. A ordem é preservada. Conferido com Bulbasaur: 1 Tackle, 3 Growl, 7
  Leech Seed…
- **TM/HM**: a tabela no ARM9 tem 100 × u16 (TM01–TM92 e HM01–HM08: Cut, Fly, Surf, Strength,
  Whirlpool, Rock Smash, Waterfall, Rock Climb). A compatibilidade de cada espécie ou forma vem
  dos 16 bytes do personal (R3).
- **Ovo** (`a/2/2/9/0000.bin`): sequência de `u16`. Um valor ≥ 20000 marca uma espécie
  (`valor - 20000`), os valores seguintes são golpes, e `0xFFFF` termina. Só espécies base têm
  golpes de ovo.
- **Tutores**: a lista (overlay 1) tem 52 registros `{ u16 golpe, u8 custo em BP, u8 área }`. O
  último é Headbutt, com custo 0 e área 3. A compatibilidade (`waza_oshie.bin`) tem 505 × u64:
  a entrada *i* < 493 é a espécie *i*+1, e as entradas 493–504 são as formas 496–507. O bit *k*
  liga a espécie ao tutor *k*.

**Motivo**: cobre os quatro tipos de learnset do FR-005 com as estruturas do próprio jogo.

**Alternativas**: um arquivo único com todos os learnsets numa só lista de eventos (menos
legível para quem consome).

## R6. Evoluções, 44 bytes

**Decisão**: 7 entradas × `{ u16 método, u16 parâmetro, u16 espécie destino }` e 2 bytes de
padding. Método 0 = entrada vazia. Os métodos (identificador original preservado, com uma chave
legível):

| Id | Chave | Parâmetro |
|----|-------|-----------|
| 1 | `friendship` | — |
| 2 | `friendship-day` | — |
| 3 | `friendship-night` | — |
| 4 | `level` | nível |
| 5 | `trade` | — |
| 6 | `trade-item` | item |
| 7 | `use-item` | item |
| 8 | `level-atk-gt-def` | nível |
| 9 | `level-atk-eq-def` | nível |
| 10 | `level-atk-lt-def` | nível |
| 11 | `level-pid-low` | nível |
| 12 | `level-pid-high` | nível |
| 13 | `level-ninjask` | nível |
| 14 | `level-shedinja` | nível |
| 15 | `beauty` | beleza mínima |
| 16 | `use-item-male` | item |
| 17 | `use-item-female` | item |
| 18 | `hold-item-day` | item |
| 19 | `hold-item-night` | item |
| 20 | `knows-move` | golpe |
| 21 | `party-species` | espécie |
| 22 | `level-male` | nível |
| 23 | `level-female` | nível |
| 24 | `level-magnetic-field` | — |
| 25 | `level-moss-rock` | — |
| 26 | `level-ice-rock` | — |

Métodos desconhecidos viram a chave `unknown`, com o id preservado e um alerta no relatório.
Conferido com Eevee: Leafeon (25), Glaceon (26), as três pedras (7: 82/83/84), Espeon (2) e
Umbreon (3).

## R7. Itens

**Decisão**: o id do item (0–536) passa pela tabela do ARM9 `{ u16 índice de dados, u16 ícone,
u16 paleta, u16 id da Gen 3 }` para chegar ao membro de `a/0/1/7`. Os 23 ids que apontam para o
dado 0 são itens não usados e não entram na lista (513 itens válidos). Estrutura de 34 bytes:

| Offset | Tam. | Campo |
|--------|------|-------|
| 0x00 | u16 | preço |
| 0x02 | u8 | efeito segurado |
| 0x03 | u8 | parâmetro do efeito segurado |
| 0x04 | u8 | efeito de Pluck |
| 0x05 | u8 | efeito de Fling |
| 0x06 | u8 | poder de Fling |
| 0x07 | u8 | poder de Natural Gift |
| 0x08 | u16 | bits: tipo de Natural Gift (0–4), impede descartar (5), selecionável (6), bolso (7–10), bolsos de combate (11–15) |
| 0x0A | u8 | função de uso no campo |
| 0x0B | u8 | função de uso no combate |
| 0x0C | u8 | tipo de uso na equipe |
| 0x0D | u8 | (padding) |
| 0x0E | 20 bytes | parâmetros de uso na equipe |

Bolsos: 0 Itens, 1 Remédios, 2 Poké Bolas, 3 TMs/HMs, 4 Frutas, 5 Cartas, 6 Itens de combate,
7 Itens-chave. Conferido: preços de Poké Ball (200), Great Ball (600), Ultra Ball (1200) e Potion
(300; bolso Remédios; Fling 30).

O "efeito original" (FR-007) é guardado como os identificadores crus (efeito segurado e
parâmetro, funções de campo e combate, uso na equipe e os 20 bytes de parâmetros em hex), sem
interpretação.

## R8. Tabelas: tipos, naturezas e experiência

**Decisão**:

- **Tipos**: 18 ids (0 Normal, 1 Lutador, 2 Voador, 3 Venenoso, 4 Terra, 5 Pedra, 6 Inseto, 7
  Fantasma, 8 Aço, 9 ???, 10 Fogo, 11 Água, 12 Planta, 13 Elétrico, 14 Psíquico, 15 Gelo, 16
  Dragão, 17 Sombrio).
- **Tabela de tipos**: triplas `(atacante, defensor, multiplicador × 10)`, com multiplicadores 0,
  5 e 20. Uma tripla `(254, 254, 0)` separa as entradas que Foresight e Odor Sleuth ignoram, e
  `255` termina. São 111 triplas no total. A saída é uma matriz 18 × 18 em décimos (0, 5, 10, 20;
  10 quando não há tripla) mais a lista de pares ignoráveis.
- **Naturezas**: 25 linhas × 5 s8 (Atq, Def, Vel, AtqE, DefE), com valores −1, 0 e +1. As linhas
  0, 6, 12, 18 e 24 são neutras.
- **Experiência**: 8 membros × 101 u32 (níveis 0–100). Só os grupos 0–5 são usados (0 Médio
  Rápido 1.000.000, 1 Errático 600.000, 2 Flutuante 1.640.000, 3 Médio Lento 1.059.860, 4 Rápido
  800.000, 5 Lento 1.250.000). Os membros 6 e 7 repetem o grupo 0 e são ignorados.

**Motivo**: guardar a matriz em décimos inteiros evita frações de ponto flutuante e mantém a
saída byte a byte idêntica (SC-003).

## R9. Habilidades e referências a textos

**Decisão**:

- **Habilidades**: a lista vai de 1 a N, em que N é o contador de entradas do banco de nomes de
  habilidades menos 1 (o banco tem 124 entradas, incluindo a "nenhuma"). Só o cabeçalho `u16` do
  banco é lido; o texto não é decodificado. Também é conferido que nenhuma espécie referencia
  uma habilidade maior que N.
- **Referências a textos** (FR-011): `{ "catalog": "<chave>", "index": n }`, com chaves
  simbólicas (`species-names`, `move-names`, `item-names`, `ability-names`, `type-names`,
  `nature-names`). O spec 5 associa cada chave a um banco. Candidatos observados pelo tamanho e
  pela contagem: 720 nomes de habilidades, 750 nomes de golpes, 222 nomes de itens; não usados
  aqui.

**Motivo**: mantém o limite de escopo com o spec 5 e evita depender de números de banco ainda
não confirmados.

## R10. Constante de layout e checagens estruturais

**Decisão**: `packages/extractor/src/data/layout.ts` exporta `SOULSILVER_US_LAYOUT` com:

- os caminhos dos NARCs;
- os offsets de ARM9 e overlays (R1);
- as contagens estruturais (100 máquinas, 52 tutores, 505 entradas de compatibilidade, 25
  naturezas, 18 tipos);
- o mapeamento de formas (R3).

As etapas recebem o layout por parâmetro (`createDataStages(layout)`), e os testes passam um
layout sintético. Cada tabela lida do código tem uma checagem estrutural que, se falhar, falha a
etapa com uma mensagem dizendo qual tabela e qual offset:

| Tabela | Checagem |
|--------|----------|
| Naturezas | as linhas neutras são zeradas; as outras têm exatamente um +1 e um −1 |
| Tabela de tipos | ids < 18 ou separador 254; multiplicadores em {0, 5, 20}; termina com 255 em até 200 triplas |
| TM/HM | 100 golpes entre 1 e 467, e o seguinte é 0 |
| Tutores | 52 registros com golpe entre 1 e 467 e área ≤ 3 |
| Mapa de itens | id 0 → dado 0, e todo índice ≤ número de membros − 1 |

**Motivo**: com a ROM travada por hash, os offsets nunca mudam. As checagens transformam um
offset errado (num teste ou numa revisão futura) num erro claro, em vez de dados silenciosamente
errados.

## R11. Representação dos campos

**Decisão**:

- **Referências entre entidades** são ids numéricos (FR-010): tipo, golpe, item, habilidade,
  espécie. Isso é estável porque são os índices originais (FR-009).
- **Enums pequenos e fechados** viram chaves legíveis, preservando o valor cru quando o spec pede
  o original. Categoria (`physical`/`special`/`status`), grupo de crescimento, grupos de ovo,
  bolso, método de evolução (+ `methodId`), alvo do golpe (+ `targetRaw`) e gênero (`kind` +
  `raw`).
- **Flags de golpe**, por bit: 0 `contact`, 1 `protect`, 2 `magicCoat`, 3 `snatch`, 4
  `mirrorMove`, 5 `kingsRock`, 6 `keepHpBar`, 7 `hideShadow`. Também `flagsRaw`.
- **Alvo do golpe**: 0 `selected`, 1 `depends`, 2 `random`, 4 `both-foes`, 8 `all-others`, 16
  `user`, 32 `user-side`, 64 `field`, 128 `foe-side`, 256 `ally`, 512 `user-or-ally`, 1024
  `foe`; outros valores viram `unknown`.
- **Precisão 0** vira `accuracy: null` ("sem checagem"). Poder e prioridade ficam crus.
- **Grupos de ovo**: 1 Monstro, 2 Água 1, 3 Inseto, 4 Voador, 5 Campo, 6 Fada, 7 Planta, 8
  Humanoide, 9 Água 3, 10 Mineral, 11 Amorfo, 12 Água 2, 13 Ditto, 14 Dragão, 15 Desconhecido.
  As chaves ficam em inglês no código (`monster`, `water-1`…).

**Motivo**: chaves legíveis tornam o consumo seguro, e o valor cru garante fidelidade e permite
remapear depois (FR-004, FR-006).

## R12. Biblioteca de schema

**Decisão**: `zod` 4.6.x (dependência do pacote `shared`). Os schemas ficam em
`packages/shared/src/game-data/`, exportados pelo subpath `@soulsilver/shared/game-data`. Os
tipos TypeScript são inferidos dos schemas (`z.infer`), sem duplicar definições.
`parseGameDataFile(kind, value, fileName)` converte o primeiro issue do zod em
`{ file, path, problem }`. O path usa notação com ponto e índices (`records.5.baseStats.hp`).

**Motivo** (princípio X): os sete arquivos têm dezenas de campos, enums e uniões. Guardas escritas
à mão, como na feature 003 (R15), deixariam de ser simples aqui. O zod é a biblioteca mais
difundida, dá o caminho do campo de cada erro e funciona no Node puro, no Electron e no
renderer.

**Alternativas**: guardas à mão (centenas de linhas para manter e testar); valibot (menor, mas
menos difundido; o tamanho não importa no processo do extractor nem no servidor); JSON Schema +
Ajv (duplica tipos e schemas).

Consequência: `shared` passa a usar especificadores `.ts` nos arquivos de `game-data/`
(`allowImportingTsExtensions`), para que a CLI do extractor, que roda em Node puro, consiga
importá-los. É o mesmo motivo do subpath `./rom-validation` da 003.

## R13. Formato e determinismo dos arquivos

**Decisão**: um JSON por tipo de dado, com o envelope
`{ "kind": "...", "formatVersion": 1, "records": [...] }`.

- `records` fica ordenado por id.
- Os objetos são montados sempre na ordem de campos do data model.
- Gravação com `JSON.stringify(value, null, 2) + "\n"`.
- Não entram datas, caminhos nem nada que dependa da máquina.

Cada etapa valida o próprio arquivo com o schema antes de gravar (FR-013).

**Motivo**: JSON é legível para quem confere a amostra (SC-002) e entra no carregador sem
dependência. Com ordem fixa, duas extrações dão bytes idênticos (SC-003). O pipeline da 003 já
calcula o digest de cada saída, e o teste de reextração compara esses digests.

**Alternativas**: um arquivo único (qualquer mudança invalidaria tudo e quebraria SC-005);
formatos binários (ilegíveis para conferência).

## R14. Divisão em etapas

**Decisão**: sete etapas novas, todas v1:

| Etapa | Entradas | Saída `json/` |
|-------|----------|---------------|
| `code-decompress` | `rom-unpack/binaries` | (saída `code/`) |
| `data-species` | `rom-unpack/narc` | `species.json` |
| `data-moves` | `rom-unpack/narc` | `moves.json` |
| `data-learnsets` | `rom-unpack/narc`, `rom-unpack/filesystem`, `code-decompress/code` | `learnsets.json`, `machines.json`, `tutors.json` |
| `data-evolutions` | `rom-unpack/narc` | `evolutions.json` |
| `data-items` | `rom-unpack/narc`, `code-decompress/code` | `items.json` |
| `data-tables` | `rom-unpack/narc`, `code-decompress/code` | `types.json`, `type-chart.json`, `natures.json`, `growth-rates.json`, `abilities.json` |

Nenhuma etapa de dados lê a saída de outra etapa de dados. Assim, mudar `data-moves` reextrai só
ela (SC-005).

**Motivo**: a granularidade segue as histórias e o SC-005. São etapas pequenas e independentes,
cada uma com teste próprio.

## R15. Relatório de sanidade

**Decisão**: `buildSanityReport(workspaceDir)` na biblioteca e a opção `--report` na CLI
existente (`npm run extract -- --out assets --report`). O relatório não exige `--rom`: lê os
arquivos já extraídos. Ele faz três coisas:

1. **Carrega e valida** cada arquivo com `parseGameDataFile`. Arquivo ausente ou erro de schema
   = **falha**.
2. **Contagens**, comparadas com `EXPECTED_COUNTS`. Diferença = **falha**.

   | Dado | Esperado |
   |------|----------|
   | Espécies | 493 |
   | Formas | 12 |
   | Golpes | 467 |
   | Habilidades | 123 |
   | Itens | 513 |
   | TMs | 92 |
   | HMs | 8 |
   | Tutores | 52 |
   | Naturezas | 25 |
   | Tipos | 18 |
   | Curvas de experiência | 6 |
   | Learnsets | 505 |

3. **Faixas e referências** = **alerta**. Os exemplos:
   - stats base entre 1 e 255; soma de EVs entre 0 e 3;
   - captura entre 1 e 255; precisão entre 1 e 100 ou null; PP entre 1 e 40 (todo PP de golpe da
     Gen 4 cabe nessa faixa); prioridade entre −7 e 5; chance entre 0 e 100;
   - nível de learnset entre 1 e 100; experiência crescente por nível;
   - gênero cru em {0, 31, 63, 127, 191, 254, 255};
   - referências a golpe, item, habilidade, tipo ou espécie que não existem;
   - método de evolução `unknown`.

A saída é um texto no stdout, com uma seção por tipo. O código de saída é 0 sem falhas e 1 com
falhas.

**Motivo**: o relatório usa os mesmos schemas do carregador e roda só localmente (FR-022).

**Alternativas**: o relatório como etapa do pipeline (rodaria no app de cada jogador sem
utilidade, e uma contagem errada bloquearia a preparação do jogo).

## R16. Estratégia de testes

**Decisão** (princípio V):

- **Builders sintéticos** em `packages/extractor/test/fixtures/game-data/`. Montam registros
  personal, de golpe, de item, de evolução e de learnset, o fluxo de golpes de ovo, as curvas,
  `waza_oshie.bin`, a tabela de tipos, a de naturezas, a de TMs, a de tutores e o mapa de itens.
  Também há um **codificador BLZ de teste** (que só gera literais e pares simples) para comprimir
  ARM9 e overlays sintéticos.
- **Testes das etapas**: montam pastas de entrada sintéticas com um layout sintético, rodam a
  etapa e conferem cada campo (incluindo os casos de borda do spec).
- **Schemas** (`shared`): um teste por regra de cada schema, mais a mensagem
  `{ file, path, problem }`.
- **Determinismo**: duas execuções de cada etapa geram bytes iguais.
- **Isolamento**: uma etapa de dados com a versão alterada reextrai só ela.
- **Relatório**: dados corretos dão zero alertas; dados alterados geram o alerta ou a falha
  esperados.
- **ROM real**: só no quickstart (SC-001, SC-002), nunca nos testes.
