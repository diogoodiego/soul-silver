# Contrato: marcação neutra dos textos

**Definida em**: `packages/shared/src/text/markup.ts`
**Leitores**: o formatador, a busca, o extrator (ida e volta) e, depois, a caixa de diálogo
(feature 17).

Este é o único lugar onde a marcação é documentada. Os arquivos do catálogo guardam texto
nesta forma.

## Gramática

```text
texto    = { caractere | escape | comando }
escape   = "\{" | "\}" | "\\"
comando  = "{" nome [ ":" argumentos ] "}"
```

Qualquer `{`, `}` ou `\` fora de um escape ou de um comando é erro de sintaxe. O texto comum é
Unicode; quebras de linha reais (`\n`) dentro de um texto são erro: use `{n}`.

## Comandos

| Marcação | Significado | Código no jogo |
|----------|-------------|----------------|
| `{n}` | quebra de linha | `0xE000` |
| `{page}` | espera por botão e abre uma nova página | `0x25BC` |
| `{scroll}` | espera por botão e rola o texto | `0x25BD` |
| `{pad}` | espaço de preenchimento (alinhar números) | caractere `0x1E2` |
| `{color:N}` | muda a cor do texto (0 volta à cor normal); N de 0 a 65535 | comando `0xFF00` |
| `{nome:slot}` | variável; `slot` de 0 a 255 | comandos `0x01xx` etc. |
| `{nome:slot,flag}` | variável com flag diferente de 0; `flag` de 0 a 255 | idem |
| `{cmd:XXXX}` | comando sem nome e sem parâmetros; `XXXX` são 4 dígitos hexadecimais maiúsculos | `0xFFFE XXXX 0` |
| `{cmd:XXXX:p1,p2}` | comando sem nome com parâmetros decimais (0 a 65535) | `0xFFFE XXXX n p…` |
| `{raw:XXXX}` | caractere sem correspondência na tabela; 4 dígitos hexadecimais maiúsculos | a palavra `XXXX` |

`nome` de variável: um dos nomes da tabela abaixo ou `var` seguido de 4 dígitos hexadecimais
maiúsculos (`var0104`).

## Variáveis

| Nome | Comando | Valor | Imprime |
|------|---------|-------|---------|
| `pokemon-species` | `0x0100` | texto | espécie de um Pokémon |
| `pokemon-name` | `0x0101` | texto | nome (apelido) de um Pokémon |
| `trainer-name` | `0x0103` | texto | nome de um treinador, inclusive o do jogador (ver abaixo) |
| `ability` | `0x0105` | texto | nome de habilidade |
| `move` | `0x0106` | texto | nome de golpe |
| `item` | `0x0108` | texto | nome de item |
| `box` | `0x010B` | texto | nome de uma caixa do PC |
| `stat` | `0x010D` | texto | nome de um stat |
| `type` | `0x010F` | texto | nome de tipo |
| `status` | `0x0111` | texto | condição de status |
| `pocket` | `0x0112` | texto | bolso da mochila |
| `phrase` | `0x011C` | texto | palavra ou frase do Easy Chat |
| `number1` … `number10` | `0x0132` … `0x013B` | número | número com largura de 1 a 10 dígitos |
| `varXXXX` | qualquer outro de `0x0100`–`0x04FF` ou `0x3400`–`0x34FF` | texto | não identificado |

`slot` é o buffer do script que preenche a variável; o texto não diz se o slot 0 de
`trainer-name` é o jogador ou o rival, isso é convenção dos scripts.

## Forma canônica

A leitura aceita só a forma canônica, para que ida e volta seja exata:

- argumentos sem espaços e sem zeros à esquerda (`{color:2}`, não `{color: 02}`);
- hexadecimais em maiúsculas com 4 dígitos;
- `flag` omitido quando 0;
- um comando de controle que o jogo usa com o nome certo **nunca** aparece como `{cmd}` (por exemplo,
  `0xFF00` é sempre `{color}`); `{cmd:FF00:1}` é erro de sintaxe.

## Erros

`parseMarkup` lança `MarkupError { position, problem }`, com `position` o índice do primeiro
caractere problemático e `problem` uma frase curta em português ("chave sem fechar", "nome
desconhecido: 'foo'", "esperado 4 dígitos hexadecimais").

## Exemplos

| Jogo (palavras de 16 bits) | Marcação |
|----------------------------|----------|
| `0xFFFE 0x0103 2 0 0` ` ’s Photo` | `{trainer-name:0}’s Photo` |
| `Photo` `0xE000` `Taken:` | `Photo{n}Taken:` |
| `Hi` `0x25BC` | `Hi{page}` |
| `0xFFFE 0xFF00 1 1` `Egg` `0xFFFE 0xFF00 1 0` | `{color:1}Egg{color:0}` |
| `0xFFFE 0x0134 2 0 0` ` lbs` | `{number3:0} lbs` |
| `0xFFFE 0x0104 2 1 0` | `{var0104:1}` |
| `0xFFFE 0xFF02 2 1 0` | `{cmd:FF02:1,0}` |
| caractere de código `0x01A3` | `{raw:01A3}` |
| `100% {braces}` | `100% \{braces\}` |
