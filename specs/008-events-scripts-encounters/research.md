# Pesquisa: Eventos, scripts, encontros e treinadores

**Feature**: [spec.md](./spec.md) | **Plano**: [plan.md](./plan.md)

Este documento resolve as decisões do plano. O R0 foi executado antes do código de produção e está
fechado: todos os formatos abaixo foram conferidos na ROM do desenvolvedor.

## R0. Verificação dos arquivos na ROM (concluída)

**Decisão**: uma sonda (`events/probe.ts`, só contagens e tamanhos, nunca bytes da ROM) confirma o
layout de cada arquivo contra os NARCs extraídos pela 003 (`node packages/extractor/src/events/probe.ts`).

**Rationale**: a spec depende de formatos que nenhum código do repositório lia. Errar um campo
troca um warp de destino ou um nível de encontro sem erro algum.

### Fonte dos formatos

Os layouts de registro, a tabela de comandos de script e as regras de resolução de id vêm da
decomp pública do HeartGold/SoulSilver (`pret/pokeheartgold`, commit `6988158`), lida só como
descrição de formato: `include/map_events_internal.h`, `include/wild_encounter.h`,
`include/trainer_data.h`, `include/field/headbutt.h`, `include/constants/init_script_types.h`,
`asm/macros/script.inc`, `asm/macros/movement.inc`, `src/script_manager.c` e
`src/field/encounter_check.c`. Nenhum arquivo da decomp entra no repositório; só os fatos
(layouts, ids, nomes) viram dados e constantes. Cada formato foi conferido na ROM pela sonda e
pela própria etapa (zero erros de leitura nos arquivos reais).

### Arquivos (NARCs relativos à saída `narc` da 003)

| Dado | Arquivo | Membros | Formato (conferido) |
|------|---------|---------|---------------------|
| Eventos do mapa | `a/0/3/2` | 491 | Quatro listas, cada uma com um `u32` de contagem: placas (20 bytes), NPCs (32), warps (12), gatilhos (16). As listas preenchem o arquivo exatamente (491 de 491). |
| Scripts | `a/0/1/2` | 965 | Tabela de `u32` (relativos ao fim do próprio campo) terminada em `0xFD13`, depois os comandos. 497 arquivos têm tabela. |
| Level scripts | `a/0/1/2` (membro do campo +8 do cabeçalho) | 452 usados | Registros de 5 bytes (`u8` tipo, `u16` script, `u16` 0), tipo 1 = tabela de quadros; termina em byte 0. 452 de 452 lidos. |
| Encontros | `a/0/3/7` | 142 | 196 bytes cada, `EncounterData`. 142 de 142. |
| Headbutt | `a/2/5/2` | 540 (um por mapa) | 4 bytes (sem árvores) ou 76 bytes de cabeçalho e tabelas mais 24 bytes por grupo de árvores. 540 de 540. |
| Treinadores (dados) | `a/0/5/5` | 738 | 20 bytes cada; o 0 é um registro vazio. |
| Treinadores (times) | `a/0/5/6` | 738 | 8 a 18 bytes por Pokémon conforme o tipo, arredondado a 4 bytes. 738 de 738. |

O cabeçalho de cada mapa (006) traz os índices de script, evento, mensagens e encontros; o campo
+8 (`scriptHeaderBank`, o level script) é lido do ARM9 pela etapa.

### Achados

- **Campos de evento (`map_events_internal.h`)**: NPC `{id, sprite, movement, type, eventFlag,
  scriptId, facing(s16), param[3], xRange, yRange, x, z, y(s32)}`; warp `{x, z, header, anchor,
  y(u32)}`; gatilho `{scriptId, x(s16), z(s16), w, h, y, val, var}`; placa `{scriptId, type, x(s32),
  z(s32), y(s32), dir}`.
- **Resolução de id de script (`script_manager.c`)**: id 0 e 0xFFFF não são script. Uma tabela de
  30 faixas decrescentes (de 10490 a 2000) manda o id para arquivos compartilhados (por exemplo
  7000 a 7999 = `a/0/1/2` membro 141, banco de mensagens 199), com entrada `id - início`. Qualquer
  outro id é do próprio mapa: arquivo `scripts` do cabeçalho, entrada `id - 1`. Ids de 3000 a 4999
  e de 5000 a 6999 são scripts de treinador; o treinador é `id - base + 1`.
- **Mensagens**: o texto de um script é o índice no banco de mensagens do arquivo (do cabeçalho do
  mapa ou da tabela de faixas); o identificador da 005 é `BBBB:I`.
- **Comandos**: 853 ids (0 a 852) com tamanhos fixos, exceto cinco com argumentos condicionais (400,
  401, 402, 465 e 489). Os tamanhos foram validados na ROM: com a tabela, os 497 arquivos de script
  decodificam seguindo os fluxos a partir das entradas, sem id desconhecido nem sobreposição. A
  regra que fecha um fluxo é `End` (2), `GoTo` (22) ou `Return` (27). Movimentos são pares
  `u16` ação e `u16` repetições, terminados na ação 254.
- **Argumentos de valor ou variável**: onde o jogo aceita "valor ou variável" (espécie, golpe,
  item, treinador, texto), um valor a partir de `0x4000` é o id de uma variável (`vars.h`:
  `VAR_BASE`). A etapa o grava como `{variable}`; sem isso, 57 referências pareciam inválidas.
- **Bytes que nenhuma entrada alcança**: 7614 bytes nos 497 arquivos: `End` e `GoTo` mortos depois
  de um `GoTo`, padding de alinhamento e 16 sequências de movimento sem referência. Não são
  decodificados; o relatório os conta.
- **Encontros**: taxas por tipo (6 bytes), grama com um nível por espaço compartilhado e uma tabela
  de espécies por horário (manhã, dia, noite), sons de rádio (dois por programa) que o jogo troca
  nos espaços 2 a 5, surf (5 espaços), Rock Smash (2), três varas (5 cada), enxames e a espécie
  de pesca noturna. O jogo usa o horário "dia" também à tarde e "noite" também de madrugada.
- **Chances por espaço**: o jogo não guarda tabela; são limiares do sorteio em
  `encounter_check.c` (grama 20/20/10/10/10/10/5/5/4/4/1/1, surf 60/30/5/4/1, varas
  40/30/15/10/5, Rock Smash 80/20, headbutt 50/15/15/10/5/5). Ficam como constante em
  `events/layout.ts` com essa origem.
- **Headbutt**: por mapa, três tabelas de 6 espaços (comum, rara, secreta) e as árvores em grupos
  de 6 coordenadas (`0xFFFF` é preenchimento); o tipo de árvore de cada grupo depende do ID do
  treinador do jogador, regra de execução que não entra nos dados.
- **Treinadores**: `trainerType` 0 a 3 (bit 0 = golpes próprios, bit 1 = item segurado); espécie
  nos 10 bits baixos e forma nos 6 altos; classe e nome vêm dos bancos de mensagens 730 e 729;
  `aiFlags` é uma máscara de 32 bits.
- **Mapas de conferência**: os mapas 60 a 66 e 384 levam o nome New Bark Town (o 60 é a cidade);
  Route 29 é o mapa 33 (encontros 1; o 134 é a mesma rota em outra fase do jogo).

### Não coberto

- **Safari Zone e Concurso de Insetos**: têm tabelas próprias em outros arquivos; ficam para uma
  feature futura se o jogo precisar delas (nenhuma das histórias da spec depende delas).
- **Nomes das flags de IA**: a máscara sai crua; a feature 20 nomeia os bits.
- **Tipo semântico dos argumentos**: só os argumentos com nome de espécie, golpe, item, treinador,
  flag, variável, texto, salto e movimento são tipados; os demais saem como número e a feature 18
  pode refinar a tabela de comandos sem mudar o extrator.

## R1. Leitores binários próprios

**Decisão**: leitores pequenos para eventos, encontros e treinadores, sobre `binary.ts`
(`readU16`, `readU32`). Cada leitor valida limites e falha com mensagem que diz o membro e o offset.

**Rationale**: sem dependência nova (princípio X); o formato é de campos fixos.

## R2. Decodificador de scripts dirigido por dados

**Decisão**: um decodificador (`events/script.ts`) segue cada entrada pelos desvios e consulta
`data/script-commands.json` (id, nome, argumentos com nome, tipo, tamanho e condição de presença).
Um id fora da tabela vira `{ raw: true, id }` na posição original, o script fica `partial` e
aquele fluxo para (o tamanho do comando é desconhecido). Hoje a tabela cobre todos os ids da ROM.

**Rationale**: princípio III; um comando novo é uma linha de tabela, e a mesma tabela serve ao
relatório e ao interpretador (feature 18).

**Alternativas**: um `switch` por comando (rejeitada: 853 ramos e sem rota para o desconhecido);
varredura linear do arquivo (rejeitada: há dados de movimento e código morto no meio).

## R3. Rótulos de salto

**Decisão**: alvos de desvio e entradas viram rótulos `L1`, `L2`... numerados pela posição; os de
movimento viram `M1`... O script guarda os comandos em ordem de endereço e `labels` aponta para a
posição na lista. Alvo fora do código, no meio de um comando ou sobre outro comando é erro do
arquivo (vai ao relatório).

## R4. Referências para texto, espécie, golpe e item

**Decisão**: argumentos de texto saem como `{ text: "BBBB:I" }` (identificador da 005, no banco de
mensagens do arquivo); espécie, golpe, item e treinador como `{ species | move | item | trainer }`
com os ids da 004. A etapa confere cada referência (texto contra o índice do catálogo, espécie,
golpe e item contra as contagens da 004) e lista no relatório as que não resolvem; nenhuma
falha hoje na ROM real.

## R5. Contrato de dados

**Decisão**: por mapa, `maps/<id>.json` (eventos e level scripts, com cada script resolvido para
`{ id, file, entry }`); `scripts/<arquivo>.json` por arquivo de script; `encounters.json`
(por banco de encontro, ligado ao mapa pelo cabeçalho da 006); `headbutt.json` (por mapa);
`trainers.json`; `report.json`. Schemas em `shared`, mesmo envelope e codec da 004,
`formatVersion`, validados ao gravar e ao carregar.

## R6. Falhas parciais e relatório

**Decisão**: o relatório tem comandos por nome com ocorrências, mapas e arquivos compartilhados;
comandos desconhecidos à parte; arquivos de script perdidos com o motivo; referências sem destino;
bytes inalcançáveis; `decodedPercent` (arquivos inteiros sobre o total) e `ok`. A etapa falha se
mais de 2% dos arquivos de script se perderem. Um arquivo curto sem tabela de script (4 ou 8
bytes) é um espaço vazio, não uma perda.

**Resultado na ROM real**: 497 arquivos, 66 209 comandos, 691 tipos de comando, 0 desconhecidos,
100% decodificado, 0 referências sem destino.

## R7. Testes e saída

**Decisão**: builders sintéticos (`test/fixtures/events/builders.ts`) de arquivo de eventos, script,
level script, encontro, headbutt e treinador; a etapa roda sobre uma mini-ROM de 2 mapas. A saída
tem chaves e listas em ordem fixa e a etapa grava duas vezes os mesmos bytes (teste).

## R8. Ordem de entrega

**Decisão**: fundação (contratos, tabela, leitores), eventos de mapa, treinadores, encontros,
scripts, relatório e CLI. A ordem reduz risco; a prioridade de produto continua a da spec.
