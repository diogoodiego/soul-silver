# Research: Textos e i18n

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-23

Tudo abaixo foi conferido com os dados da sua ROM, já extraídos pela feature 003
(`narc/a/0/2/7`, 829 membros). Nenhum texto da ROM foi copiado para o repositório: só estrutura,
números e trechos curtos de contexto usados como evidência. Cada item segue Decisão / Motivo /
Alternativas.

**Provas feitas com protótipo descartável**

| Prova | Resultado |
|-------|-----------|
| Ler todos os bancos | 829 bancos, 49.984 textos, 0 erros, entradas contíguas, sem bytes sobrando |
| Terminador | todo texto termina em `0xFFFF` |
| Comandos `0xFFFE` | 0 comandos quebrados em todos os bancos |
| Ida e volta | **829 de 829 bancos** reproduzem o binário byte a byte, com 738 textos comprimidos |

---

## R1. Formato do banco e cifra

**Decisão**:

```text
u16 count, u16 seed
count × { u32 offset, u32 length }      tabela, cifrada
textos, contíguos, em ordem             cifrados, cada um terminado em 0xFFFF
```

- **Tabela**: `key = (seed × 0x2FD) & 0xFFFF`. Para a entrada *i*: `k = (key × (i+1)) & 0xFFFF`,
  `k32 = k | (k << 16)`, e `offset` e `length` são lidos com XOR `k32`. `length` conta palavras
  de 16 bits, **incluindo** o terminador.
- **Texto *i***: `ck = (0x91BD3 × (i+1)) & 0xFFFF`. Cada palavra é lida com XOR `ck`, e depois
  `ck = (ck + 0x493D) & 0xFFFF`.
- A primeira entrada começa em `4 + count × 8`, e cada uma começa onde a anterior termina.

**Motivo**: é o formato que todos os 829 bancos seguem. A semente varia por banco e precisa ser
guardada para recodificar.

**Alternativas**: nenhuma; é o formato do jogo.

## R2. Texto comprimido (`0xF100`)

**Decisão**: 738 textos (728 no banco 0729, que são nomes de treinadores, e 10 no 0246) começam com
a palavra `0xF100`. O resto é um fluxo de caracteres de **9 bits** empacotados em palavras de
**15 bits úteis** (o bit 15 de cada palavra é sempre 0), do menos significativo para o mais:

- ler: `acc |= (palavra & 0x7FFF) << bits; bits += 15`; sempre que `bits ≥ 9`, tirar 9 bits como um
  caractere; `0x1FF` encerra;
- gravar: os caracteres, depois `0x1FF` e preenchimento com bits 1, **truncados** em
  `ceil(9 × n / 15)` palavras. O terminador cabe inteiro só quando sobram 9 bits ou mais
  ("Wade" fecha limpo; "Silver" fica com 6 bits de 1, sem terminador completo);
- depois das palavras vem o `0xFFFF` normal.

Só cabem códigos de 0 a 0x1FE, então estes textos nunca têm comandos nem quebras de linha.

**Motivo**: é a única regra que reproduz os 738 textos byte a byte. O erro mais fácil é ler 16 bits
por palavra: 209 textos "não terminam" e saem como lixo.

**Alternativas**: tratar o marcador como texto simples (os nomes de treinadores viram lixo e a
ida e volta falha).

## R3. Modelo de tokens

**Decisão**: depois de decifrar (e descomprimir), um texto é uma sequência de palavras de 16 bits:

| Palavra | Significado | Ocorrências |
|---------|-------------|-------------|
| `0xFFFE` + `cmd` + `n` + *n* parâmetros | comando de controle | 13.926 |
| `0xE000` | quebra de linha | 32.376 |
| `0x25BC` | espera por botão e nova página | 12.399 |
| `0x25BD` | espera por botão e rolagem | 3.754 |
| `< 0xE000` | caractere da tabela | o resto |

O `0xFFFE` é seguido de `cmd` (identificador do comando), `n` (quantidade de parâmetros) e os
parâmetros. Isso fecha sem sobras em todos os bancos. `0xF100` só vale como primeira palavra.

**Motivo**: reflete a estrutura medida. Um valor desconhecido nunca é descartado: caractere
desconhecido vira `{raw:XXXX}`, e comando desconhecido vira `{cmd:XXXX:p1,p2}`.

## R4. Tabela de caracteres

**Decisão**: `charmap.ts` no extrator, com os códigos de 16 bits do jogo:

| Faixa | Caractere |
|-------|-----------|
| `0x121`–`0x12A` | `0`–`9` |
| `0x12B`–`0x144` | `A`–`Z` |
| `0x145`–`0x15E` | `a`–`z` |
| `0x1DE` | espaço |

Símbolos e acentos, cada um confirmado por palavras conhecidas no contexto real:

| Código | Texto | Evidência |
|--------|-------|-----------|
| `0x1AB` `0x1AC` `0x1AD` `0x1AE` | `!` `?` `,` `.` | fim de frases |
| `0x1B1` | `/` | "{n}/{n}/{n}" (data) |
| `0x1B3` | `’` | "It’s", "{trainer}’s" |
| `0x1B4` `0x1B5` | `“` `”` | "choose “Pass”" |
| `0x1B9` `0x1BA` | `(` `)` | "point(s)" |
| `0x1BB` `0x1BC` | `♂` `♀` | "School Kid♂", "Ace Trainer♀" |
| `0x1BE` | `-` | "high-tech", "ten-legged" |
| `0x1C1` `0x1C2` | `+` `&` | "L+A", "TMs & HMs" |
| `0x1C4` | `:` | "Taken: " |
| `0x1D2` `0x1E8` | `%` `°` | "100%", "5 °C" |
| `0x1A8` | `¥` | "pay ¥{n}" |
| `0x188` `0x189` | `é` `ê` | "Pokémon", "frêle" |
| `0x180` `0x181` `0x17F` | `á` `â` `à` | "alimentándose", "appâte", "à la" |
| `0x183` `0x195` `0x19B` | `ä` `ö` `ü` | "Nährstoffe", "Körper", "für" |
| `0x186` `0x187` `0x18D` | `ç` `è` `î` | "aperçu", "après", "connaît" |
| `0x18B` `0x18C` `0x190` | `ì` `í` `ñ` | "così", "días", "montañas" |
| `0x191` `0x192` `0x193` | `ò` `ó` `ô` | "può", "caparazón", "hôte" |
| `0x198` `0x199` `0x19A` | `ù` `ú` `û` | "où", "púas", "sûr" |
| `0x1A0` `0x17E` | `œ` `ß` | "cœur", "süßes" |
| `0x163` `0x166` `0x167` | `Ä` `À` `È` | "Ästen", "À", "È" |
| `0x175` `0x179` `0x17B` | `Ö` `Ú` `Ü` | "Öffnung", "Última", "Über" |
| `0x1E2` | `{pad}` | preenchimento à esquerda de números ("␠␠15.2 lbs") |

Os demais códigos latinos (por exemplo, `0x160`, `0x18E`, `0x1B0`, `0x1C0`, `0x1C3`, `0x1C5`,
`0x1E0`, `0x1E1`) aparecem poucas vezes e a evidência não fecha o significado. Eles ficam fora
da tabela até serem confirmados e saem como `{raw:XXXX}` e no relatório (R9).

**Japonês**: a ROM dos EUA traz bancos de texto japonês (a faixa 0152–0170 e as versões japonesas
da Pokédex, como 0810, 0822 e 0828). Neles aparecem cerca de 180 códigos entre `0x01` e `0xFE`
(kana). Esta feature **não** mapeia o japonês: esses códigos saem como `{raw:XXXX}` e são contados
no relatório. A ida e volta continua exata, porque `{raw:XXXX}` é reversível.

**Motivo**: o critério é "nenhum caractere desconhecido é descartado", não "mapear tudo". O inglês
e as línguas latinas dos bancos da Pokédex ficam legíveis, e o que não está confirmado fica
visível e rastreável.

**Alternativas**: inventar valores para os códigos sem evidência (arrisca texto errado sem
ninguém notar); mapear o japonês inteiro (grande, sem uso no jogo em inglês).

## R5. Comandos de controle e variáveis

**Decisão**: os comandos `0xFFFE` se dividem em:

**Variáveis** (comando entre `0x0100`–`0x04FF` ou `0x3400`–`0x34FF`, sempre com 2 parâmetros:
*slot* e um flag que nesta ROM é sempre 0). O nome vem do **tipo de coisa** que a variável
imprime, determinado pelo uso:

| Comando | Nome | Evidência |
|---------|------|-----------|
| `0x0100` | `pokemon-species` | "Caught {…}!", "Both you and your friend have chosen {…}" |
| `0x0101` | `pokemon-name` | "{…} used Pound!", "{…} is getting pumped!" |
| `0x0103` | `trainer-name` | "PLAYER: {…}", "{…}’s Photo", "{…} used the {item}" |
| `0x0105` | `ability` | "{…} avoided damage by using {…}!" |
| `0x0106` | `move` | "Teach {…} to a Pokémon?" |
| `0x0108` | `item` | "The {…} item is selected." |
| `0x010B` | `box` | "transferred to {…} in someone’s PC" |
| `0x010D` | `stat` | "{…}’s base {…} rose!" |
| `0x010F` | `type` | "good with the {…} type" |
| `0x0111` | `status` | "cured its {…} status!" |
| `0x0112` | `pocket` | "in the {…} Pocket" |
| `0x011C` | `phrase` | "You win... {…}!" (frase do Easy Chat; evidência moderada) |
| `0x0132`–`0x013B` | `number1`–`number10` | "x{…}", "Lv. {…}", "Coins: {…}", "¥{…}"; o sufixo é a largura em dígitos (hipótese: `cmd − 0x131`, coerente com Lv. = 3 e Coins = 5) |

Qualquer outra variável tem o nome genérico `var` + o comando em hexadecimal de 4 dígitos
(`var0104`, `var0300`…), com o mesmo comportamento. O nome genérico é estável e reversível; um nome
melhor é uma mudança só na tabela.

**Jogador e rival**: a ROM **não** distingue "nome do jogador" de "nome do rival" no texto: os dois
usam o mesmo comando (`trainer-name`) e quem escolhe o nome é o *slot*, que o script de cada evento
preenche. O que o texto garante é só "este é o nome de um treinador no slot *k*". Por isso o
catálogo expõe `{trainer-name:0}`, e os specs de scripts (feature 8 em diante) decidem que o slot 0
é o jogador, por convenção. Isto difere de "variáveis nomeadas (do jogador, do rival)" do pedido.

**Outros comandos**:

| Comando | Parâmetros | Markup | Evidência |
|---------|------------|--------|-----------|
| `0xFF00` | 1 (cor) | `{color:N}` | "Receive a {color:1}MANAPHY Egg{color:0}"; 0 restaura |
| `0xFF01` | 1 | `{cmd:FF01:N}` | "{FF01:200}SHOVE!{FF01:100}▼" (pausa/velocidade; nome incerto) |
| `0x0200`–`0x0204` | 1 | `{cmd:02XX:N}` | "OK? {0200:0}" (prompt de menu; nome incerto) |
| `0x0205` `0x0206` | 0 | `{cmd:0205}` | "{0205}UNOWN" no começo de textos |
| `0xFF02` | 2 | `{cmd:FF02:1,0}` | 1 uso |

Os "nomes incertos" ficam genéricos de propósito: o que o jogo faz com eles é da caixa de diálogo
(feature 17).

**Motivo**: nomear só o que a evidência sustenta; o resto é preservado e reversível.

## R6. Marcação neutra

**Decisão** (gramática completa em [contracts/markup.md](./contracts/markup.md)):

- Texto comum aparece como é, em Unicode. `{`, `}` e `\` são escritos `\{`, `\}` e `\\`.
- `{n}` quebra de linha, `{page}` espera por botão e nova página, `{scroll}` espera por botão e
  rolagem, `{pad}` preenchimento.
- `{color:N}`; variáveis `{nome:slot}` (e `{nome:slot,flag}` quando o flag não é 0);
  `{cmd:XXXX:p1,p2}` para comandos sem nome; `{raw:XXXX}` para caractere sem tabela.
- A leitura da marcação é estrita: chave sem fechar, nome desconhecido ou argumento inválido são
  erros com a posição, nunca texto.

**Motivo**: legível para um tradutor, sem confundir texto com código, e sem perda: cada token tem
uma forma única de ida e volta.

**Alternativas**: XML ou HTML (pesado para editar à mão); manter os códigos numéricos (ilegível);
Unicode privado para os controles (invisível para o tradutor).

## R7. Identificadores e bancos com nome

**Decisão**: o identificador de um texto é `BBBB:I`, com o banco em 4 dígitos decimais e o índice
em decimal (`0237:25`). Para bancos conhecidos aceita-se também `nome:I` (`species-names:25`).

Bancos nomeados, conferidos pelo conteúdo:

| Nome | Banco | Entradas | Conferência |
|------|-------|----------|-------------|
| `species-names` | 0237 | 496 | #1 BULBASAUR, #25 PIKACHU, #493 ARCEUS |
| `move-names` | 0750 | 468 | #1 Pound |
| `item-names` | 0222 | 537 | #17 Potion |
| `ability-names` | 0720 | 124 | #65 Overgrow |
| `type-names` | 0735 | 18 | #0 NORMAL, #10 FIRE |
| `nature-names` | 0034 | 25 | #0 Hardy, #24 Quirky |
| `item-descriptions` | 0221 | 537 | #17 "A spray-type medicine…" |
| `move-descriptions` | 0749 | 468 | #1 "The foe is physically pounded…" |
| `ability-descriptions` | 0722 | 124 | #65 "Powers up Grass-type moves…" |
| `trainer-names` | 0729 | 738 | #1 Silver, #4 Wade (comprimido) |
| `map-names` | 0279 | 235 | #126 New Bark Town, #138 Pallet Town |

Os nomes de espécie, golpe e habilidade existem também em caixa alta (0751, 0721) e em versões com
artigo (0238); ficam só com número. Os índices coincidem com os ids da feature 004 (espécie =
número nacional, golpe = id, item = id, habilidade = id, tipo = id, natureza = id), então as
referências `{catalog, index}` da 004 resolvem direto: `species-names` → 0237 etc. (FR-008).

**Diálogos de mapa**: o cabeçalho de mapa que liga cada mapa ao seu banco **não** está no ARM9
(procurei por uma tabela de 540 registros de 24 bytes). Fica como tarefa de pesquisa com prazo:
procurar nos overlays; se não achar, os bancos de diálogo ficam só com número (FR-009 cobre isso).

**Motivo**: nomear só o que foi conferido. Os nomes de espécies, golpes, itens, habilidades, tipos
e naturezas são os que a feature 004 precisa.

## R8. Pokédex e outros idiomas dentro da ROM

**Decisão**: a ROM dos EUA traz textos em francês, alemão, italiano, espanhol e japonês (por
exemplo, 0806–0809 são a Pokédex em FR/DE/IT/ES, e 0818–0821 são nomes de espécie em outros
idiomas). Eles são decodificados como todos os outros bancos e ficam no catálogo `en` sob o número
do banco (a ROM os entrega assim), sem separar por idioma.

**Motivo**: o pedido diz que o catálogo gerado é o de inglês e que a tradução é futura. Separar
esses bancos em catálogos `fr`, `de` etc. seria uma mudança de escopo. Fica registrado como
oportunidade.

## R9. Catálogo em disco

**Decisão**: a etapa `text-catalog` grava, na saída `catalog`:

```text
catalog/
├── index.json          kind "text-index": uma linha por banco (banco, nome, quantidade)
├── report.json         kind "text-report": R10
└── en/
    ├── 0000.json       kind "text-bank": um arquivo por banco
    └── … 0828.json
```

Cada `text-bank` usa o envelope das features 003 e 004 (`kind`, `formatVersion`, `records` por
id crescente) com os campos extras `language`, `bank` e `name`; cada registro é `{ id, text }`
com `text` em marcação. Um catálogo de outro idioma tem a mesma estrutura em `catalog/<idioma>/`
e pode listar só as chaves traduzidas. Os schemas ficam em `shared` (zod), e o schema de `text`
valida a marcação (R6).

**Motivo**: um arquivo por banco é editável e dá diffs pequenos; reaproveita o envelope e o
validador da 004. Nomes de arquivo numéricos não mudam quando um nome de banco muda.

**Alternativas**: um arquivo só (3–10 MB, ruim de editar); nomes de arquivo com o nome do banco
(instável).

## R10. Ida e volta e relatório

**Decisão**: a etapa, para cada banco, faz `bytes → banco → marcação → banco → bytes` e exige que os
bytes finais sejam idênticos aos de entrada. Qualquer diferença **falha a etapa** (SC-003). O
`report.json` guarda: bancos e textos decodificados, bancos com nome, contagem de `{raw}` por
código e por banco, contagem de `{cmd}` por comando, e as referências de nome da 004 sem destino.

A CLI `--report` (feature 004) ganha uma seção "Textos": contagens, os 10 códigos desconhecidos
mais frequentes, e as referências da 004 que não resolvem. Referência sem destino **falha** o
relatório (SC-004). Código desconhecido só gera alerta (FR-020).

**Motivo**: a ida e volta é a prova mais forte de que nada se perdeu, e já fecha nos 829 bancos
do protótipo.

## R11. Formatação

**Decisão**: `formatText(text, values, id?)` em `shared`. As chaves de `values` são
`nome:slot` (`"trainer-name:0"`, `"number3:1"`). Regras:

1. toda variável do texto precisa de um valor; falta → erro com o identificador e a chave;
2. valor que o texto não usa → erro (pega erro de digitação);
3. variável repetida usa o mesmo valor em todas as ocorrências;
4. `number*` aceita número ou texto numérico; as demais aceitam texto;
5. `{n}`, `{page}`, `{scroll}`, `{color}` e `{cmd}` passam sem alteração (FR-015);
6. `\{`, `\}` e `\\` continuam escapados no resultado, para o interpretador da caixa de diálogo
   ler o mesmo texto.

**Alternativas**: função que devolve texto sem marcação (a caixa de diálogo precisaria das
quebras e cores).

## R12. i18n e fallback

**Decisão**: `createTextCatalog({ en, "pt-BR": … })` em `shared`, sem acesso a disco. `get(id, language)`
devolve `{ text, language, fallback }`: o texto do idioma pedido, ou o do inglês com
`fallback: true`. Idioma inexistente usa o inglês e o resultado informa `fallback: true`.
`validateTranslation(en, translated)` compara, por texto, o multiconjunto de variáveis
(`nome:slot[,flag]`); qualquer diferença é erro com identificador, variável e problema (FR-013).
O carregamento de arquivos (`loadTextCatalog(dir)`) fica no extrator e no app.

**Motivo**: o servidor de jogo e o renderer não podem usar o disco (princípios IV e IX), então a
lógica pura mora em `shared`.

## R13. Busca

**Decisão**: `npm run extract -- --out assets --find "trecho" [--lang en] [--limit 20]`. Normalização:
minúsculas, sem acentos (`NFD` e remoção de marcas), quebras (`{n}`, `{page}`, `{scroll}`) viram um
espaço, `{color}` e `{cmd}` somem, `{pad}` vira espaço, variáveis ficam literais (`{trainer-name:0}`)
e espaços repetidos viram um. Resultados em ordem de banco e índice, até `--limit`. Carregar os 829
arquivos leva cerca de um segundo; a busca em si é uma varredura linear de ~50 mil textos.

**Alternativas**: índice invertido (desnecessário para 50 mil textos; YAGNI).

## R14. Estratégia de testes

**Decisão** (princípio V):

- **Banco sintético**: `buildBank(entries, { seed, compressed? })` no teste cifra tudo com as
  mesmas regras de R1 e R2, independente do código do extrator, para o teste não depender do que
  testa.
- **Decodificação**: cifra, tabela, terminador, `0xF100`, 9 bits em 15, truncamento, entradas
  vazias, banco com um texto, banco corrompido e truncado.
- **Charmap e comandos**: cada símbolo da tabela, `{raw}` e `{cmd}` desconhecidos preservados.
- **Marcação**: ida e volta de cada token, escapes, erros de sintaxe com posição.
- **Ida e volta** de bancos sintéticos aleatórios (propriedade): `encode(decode(x)) == x`.
- **Formatação, catálogo e fallback** em `shared`.
- **Busca**: acentos, maiúsculas, quebras, limite.
- **Etapa**: ponta a ponta com banco sintético, determinismo, isolamento de versão.
- **ROM real**: só no quickstart (SC-001 a SC-004).

## R15. Dependências

**Decisão**: nenhuma dependência nova. A cifra, a compressão, o charmap e o parser da marcação
são código próprio (algumas centenas de linhas); `zod` já existe em `shared`.
