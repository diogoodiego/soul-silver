# Dívida técnica: textos da feature 005

## Caracteres e comandos sem nome no catálogo

**Situação**: a extração preserva e lista, sem descartar, **220 códigos de caractere** sem
correspondência na tabela (`{raw:XXXX}`), presentes em **57 bancos**, com 33.754 ocorrências. Também
há 9 códigos de comando sem nome; o mais frequente é `0x0200` (738 ocorrências, avisos e menus).

**Por que é dívida e não bug**: o critério SC-001 do spec diz "sem caracteres desconhecidos". Com a
tabela atual esse critério **não é atendido**. A regra do próprio spec (FR-004) permite preservar e
listar, e é isso que a etapa faz. A ida e volta continua exata porque `{raw}` é reversível.

**O que os códigos são (verificado)**:
- **Não são só japoneses.** 38 dos 57 bancos também contêm texto em inglês. Exemplo: o banco
  0040 (diálogos de New Bark Town) tem `Press Up {raw:01BD} SELECT {raw:01BD} B`, onde `01BD` é um
  glifo de botão, e `WHEN YOU’RE {raw:01C0}1`, com outro símbolo.
- **Os maiores volumes** estão nos bancos 0810, 0822 e 0828 (versões japonesas da Pokédex), e nos
  blocos 0152–0171 (cerca de 180 códigos de kana, pelo que a tabela sugere).
- **Correção de uma afirmação anterior**: eu havia escrito que os bancos em inglês conferidos não
  tinham códigos sem nome. Essa checagem foi feita só para o texto, não para os códigos, e ela estava
  errada para o 0040.
- O relatório mostrava os números de banco em hexadecimal. Corrigido: agora mostra o número decimal
  do arquivo (`0152`, não `0098`).

**Onde ver**: `report.json` (contagem por código e por banco) e a seção "Textos" do `--report`.

**Quando resolver**: se um símbolo sem nome aparecer como `{raw:…}` no jogo ou nas ferramentas, ou se
o japonês entrar no escopo (o spec 5 não cobre idiomas além do inglês).

**Como resolver**: acrescentar o código à tabela `charmap.ts` (ou a uma tabela de símbolos de botão),
com a evidência em `research.md` (R4). Depois, rodar a extração e o relatório. A ida e volta
continua exata.

**Dono**: desenvolvedor do extrator (você, quando decidir).
