# Feature Specification: Dados do jogo

**Feature Branch**: `004-game-data-extraction`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Dados do jogo: etapa do extrator que converte os dados mecânicos da
ROM em arquivos de dados validados por schema. Estes dados são a base do balanceamento
(princípio I) e de todo o conteúdo data-driven (princípio III)."

## Contexto

Combate, captura, progressão, lojas e spawns dependem dos números do jogo original. Eles precisam
vir da ROM do jogador, e não ser digitados à mão nem copiados de wikis. Assim o remake é fiel
(princípio I), o conteúdo vive em arquivos de dados (princípio III) e nada protegido é distribuído
(princípio II), porque os arquivos nascem na máquina de cada jogador.

Esta feature acrescenta etapas ao pipeline de extração da feature 003. Elas consomem as saídas
brutas da etapa de desempacotamento e geram arquivos de dados prontos para o jogo.

Atores:

- **Desenvolvedor**: escreve combate, progressão, lojas e spawns consumindo os arquivos de dados,
  e roda o relatório de sanidade com a própria ROM.
- **Jogador**: não interage com esta feature diretamente. Os dados são gerados durante a
  preparação do jogo (feature 003), sem nenhuma ação a mais.

Termos:

- **Espécie**: um Pokémon da Pokédex nacional (1 a 493).
- **Forma alternativa**: variação de uma espécie com dados próprios (por exemplo, as formas de
  Deoxys, Wormadam, Giratina, Shaymin e Rotom).
- **Identificador original de efeito**: o número que o jogo original usa para escolher o
  comportamento de um golpe ou item. Fica preservado para ser mapeado depois.
- **Catálogo de textos**: os nomes e descrições extraídos pela feature 005. Esta feature só
  guarda referências a esse catálogo.
- **Relatório de sanidade**: resumo gerado ao fim da extração, com contagens e valores
  suspeitos.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Espécies e golpes tipados (Priority: P1)

O desenvolvedor do combate abre os arquivos de dados e consulta, para qualquer Pokémon ou forma
alternativa: stats base, tipos, habilidades, taxa de captura, experiência base, rendimento de
EVs, proporção de gênero, grupo de crescimento, grupos de ovo e itens segurados na natureza. Para
qualquer golpe, consulta: tipo, categoria, poder, precisão, PP, prioridade, alvo, flags e o
identificador original de efeito. O mesmo vale para a tabela de tipos, as naturezas e a lista de
habilidades. Tudo tem formato conhecido e validado; nada precisa ser fixado no código.

**Why this priority**: combate e captura, o núcleo do Marco 2, não existem sem esses números.

**Independent Test**: rodar a extração com uma ROM sintética que contém espécies e golpes
conhecidos e conferir cada campo dos arquivos gerados; com a ROM real, conferir a amostra de
SC-002.

**Acceptance Scenarios**:

1. **Given** a ROM real extraída, **When** o desenvolvedor consulta a espécie de número 6
   (Charizard), **Then** encontra stats base, tipos, habilidades e os demais campos, com valores
   iguais aos do jogo original.
2. **Given** a ROM real extraída, **When** o desenvolvedor consulta Deoxys, **Then** encontra a
   forma normal e cada forma alternativa, cada uma com os próprios dados e ligada à espécie base.
3. **Given** a ROM real extraída, **When** o desenvolvedor consulta um golpe, **Then** encontra
   todos os campos listados, incluindo o identificador original de efeito sem nenhuma
   interpretação.
4. **Given** a ROM real extraída, **When** o desenvolvedor consulta a tabela de tipos, **Then**
   encontra o multiplicador de cada par atacante × defensor, para todos os tipos do jogo.
5. **Given** a ROM real extraída, **When** o desenvolvedor consulta as naturezas, **Then**
   encontra as 25 naturezas com o stat que cada uma aumenta e diminui.
6. **Given** um arquivo de dados alterado à mão com um campo inválido, **When** o jogo ou uma
   ferramenta o carrega, **Then** o carregamento falha com uma mensagem que diz o arquivo, o
   caminho do campo e o problema.

---

### User Story 2 - Progressão: learnsets, evoluções e experiência (Priority: P2)

O desenvolvedor da progressão consulta, para cada espécie e forma, os golpes aprendidos por
nível, por TM/HM, por ovo e por tutor; as evoluções, com o método e a condição de cada uma; e a
curva de experiência de cada grupo de crescimento. Consulta também os itens, com preço, bolso, uso
no campo, uso no combate e efeito original.

**Why this priority**: nível, evolução, lojas e mochila dependem destes dados, mas só depois que
o combate básico existir.

**Independent Test**: com uma ROM sintética contendo learnsets, evoluções, curvas e itens
conhecidos, conferir os arquivos gerados campo a campo.

**Acceptance Scenarios**:

1. **Given** a ROM real extraída, **When** o desenvolvedor consulta o learnset por nível de uma
   espécie, **Then** encontra a lista de pares (nível, golpe) na ordem do jogo original.
2. **Given** a ROM real extraída, **When** o desenvolvedor consulta os golpes de TM/HM de uma
   espécie, **Then** encontra cada TM/HM compatível, identificado pelo número da máquina e pelo
   golpe que ela ensina.
3. **Given** a ROM real extraída, **When** o desenvolvedor consulta as evoluções de Eevee,
   **Then** encontra todas, cada uma com o método (por exemplo, pedra, amizade em certo período
   do dia, local) e a condição (qual pedra, qual período, qual local).
4. **Given** a ROM real extraída, **When** o desenvolvedor consulta a curva de experiência de um
   grupo de crescimento, **Then** encontra a experiência total necessária para cada nível de 1 a
   100.
5. **Given** a ROM real extraída, **When** o desenvolvedor consulta um item, **Then** encontra
   preço, bolso, uso no campo, uso no combate e o identificador original de efeito.

---

### User Story 3 - Relatório de sanidade (Priority: P3)

Ao fim da extração dos dados, o desenvolvedor vê um relatório com as contagens de cada tipo de
dado, comparadas com as esperadas (por exemplo, 493 espécies e 467 golpes), e uma lista de valores
fora de faixa ou suspeitos. Assim percebe na hora uma extração errada, antes que ela vire um bug
no combate.

**Why this priority**: protege as outras histórias contra erros silenciosos de leitura, mas os
dados já são úteis sem ele.

**Independent Test**: rodar o relatório sobre dados corretos (sem alertas) e sobre dados
alterados de propósito (contagem errada, stat fora de faixa) e conferir os alertas.

**Acceptance Scenarios**:

1. **Given** a ROM real extraída, **When** o desenvolvedor gera o relatório, **Then** todas as
   contagens esperadas fecham e não há nenhum erro de schema.
2. **Given** dados com um valor fora de faixa (por exemplo, precisão 150), **When** o relatório
   roda, **Then** ele lista o registro, o campo, o valor e a faixa esperada.
3. **Given** dados com uma contagem diferente da esperada, **When** o relatório roda, **Then** ele
   mostra a contagem obtida e a esperada, e termina indicando falha.
4. **Given** a integração contínua, **When** ela roda, **Then** o relatório não roda, porque ele
   exige a ROM real.

---

### Edge Cases

- **Entrada vazia de índice 0** (o jogo original tem uma espécie "nenhuma" e um golpe "nenhum"
  no índice 0): não aparece como espécie nem golpe válido, e não entra nas contagens.
- **Espécies sem segunda habilidade ou com um só tipo**: a segunda habilidade fica ausente, e o
  segundo tipo também (em vez de repetir o primeiro).
- **Espécies sem gênero ou só de um gênero**: a proporção de gênero distingue "sem gênero",
  "só macho" e "só fêmea" de uma proporção numérica.
- **Golpes que nunca erram**: a precisão distingue "nunca erra" de um valor numérico.
- **Golpes com poder variável ou sem poder**: o poder original fica preservado (incluindo 0 e o
  valor especial de poder variável), sem cálculo.
- **Itens sem preço ou que não podem ser vendidos**: preço 0, preservado como no original.
- **Evolução por condição que não se aplica neste jogo** (por exemplo, métodos de outras
  versões): o método e a condição originais ficam preservados, com o identificador numérico,
  mesmo que o jogo não os use.
- **Formas alternativas sem learnset próprio**: ficam ligadas ao learnset da espécie base, sem
  duplicar.
- **Dados inválidos na ROM** (fora de qualquer faixa conhecida): a extração grava o valor
  original, e o relatório de sanidade o lista. A extração só falha quando o dado não puder ser
  lido (estrutura truncada ou corrompida).
- **Arquivo de dados ausente no carregamento**: erro claro com o nome do arquivo, como na
  validação de campos.

## Requirements *(mandatory)*

### Functional Requirements

**Espécies**

- **FR-001**: A extração MUST gerar, para cada uma das 493 espécies e cada forma alternativa com
  dados próprios: stats base (PS, Ataque, Defesa, Ataque Especial, Defesa Especial, Velocidade),
  tipos (1 ou 2), habilidades (1 ou 2), taxa de captura, experiência base, rendimento de EVs por
  stat, proporção de gênero, grupo de crescimento, grupos de ovo (1 ou 2) e itens segurados na
  natureza (comum e raro).
- **FR-002**: Cada forma alternativa MUST indicar a espécie base e o número da forma.

**Golpes**

- **FR-003**: A extração MUST gerar, para cada um dos 467 golpes: tipo, categoria (físico,
  especial ou status), poder, precisão, PP, prioridade, alvo, flags e identificador original de
  efeito, junto com a chance do efeito secundário quando houver.
- **FR-004**: O identificador original de efeito MUST ser preservado sem interpretação, para ser
  mapeado a arquétipos de tempo real no spec 13.

**Learnsets e evoluções**

- **FR-005**: A extração MUST gerar, para cada espécie e forma com dados próprios, os learnsets
  por nível (pares nível × golpe, na ordem original), por TM/HM, por ovo e por tutor.
- **FR-006**: A extração MUST gerar as evoluções de cada espécie: espécie de destino, método e
  condição (item, nível, período, local, golpe, espécie ou outro parâmetro, conforme o método),
  preservando o identificador numérico original do método.

**Itens**

- **FR-007**: A extração MUST gerar, para cada item: preço, bolso, uso no campo, uso no combate e
  identificador original de efeito.

**Tabelas gerais**

- **FR-008**: A extração MUST gerar a tabela de tipos (multiplicador de cada par atacante ×
  defensor), as 25 naturezas (stat aumentado e diminuído), a lista de habilidades e as curvas de
  experiência de cada grupo de crescimento, para os níveis 1 a 100.

**Identificadores e nomes**

- **FR-009**: Todo registro MUST ter um identificador estável entre reextrações e entre versões
  do app, derivado do índice original no jogo.
- **FR-010**: Registros MUST referenciar outros registros pelo identificador (por exemplo, o
  golpe de um learnset, a habilidade de uma espécie, o item de uma evolução).
- **FR-011**: Nomes e descrições MUST NOT ser copiados para estes arquivos; cada registro guarda
  a referência ao texto correspondente no catálogo de textos (feature 005).

**Schemas e validação**

- **FR-012**: Cada tipo de dado MUST ter um schema único, compartilhado entre o extrator e o jogo
  (princípio VI).
- **FR-013**: A extração MUST validar cada arquivo contra o schema antes de gravá-lo, e MUST
  falhar a etapa se algum registro não passar.
- **FR-014**: O carregamento MUST validar cada arquivo contra o schema e, quando inválido, falhar
  com mensagem que diz o arquivo, o caminho do campo e o problema (princípio III).
- **FR-015**: Cada arquivo de dados MUST registrar a versão do próprio formato, para que uma
  mudança de formato seja detectada no carregamento.

**Pipeline**

- **FR-016**: Os dados MUST ser gerados por etapas registradas no pipeline da feature 003, com
  versão própria, consumindo apenas as saídas da etapa de desempacotamento. Uma atualização que
  muda uma dessas etapas MUST reextrair só ela e as dependentes, sem pedir a ROM.
- **FR-017**: Duas extrações da mesma ROM MUST gerar arquivos idênticos byte a byte (ordem de
  registros, ordem de campos e formatação determinísticas).
- **FR-018**: A extração MUST gravar os valores originais da ROM, sem nenhum ajuste de
  balanceamento (princípio I).

**Relatório de sanidade**

- **FR-019**: O relatório MUST mostrar a contagem de cada tipo de dado e compará-la com a
  esperada para o SoulSilver (EUA): 493 espécies, 467 golpes, 25 naturezas, 6 curvas de
  experiência, e as contagens conhecidas de habilidades, itens, TMs/HMs e formas alternativas.
- **FR-020**: O relatório MUST listar cada valor fora da faixa esperada (por exemplo, stat base
  fora de 1 a 255, precisão acima de 100, PP fora de 1 a 40, proporção de gênero fora dos valores
  conhecidos, referência a golpe, item ou habilidade inexistente), com registro, campo, valor e
  faixa.
- **FR-021**: O relatório MUST terminar indicando falha quando alguma contagem não fechar ou
  algum registro falhar no schema; valores fora de faixa geram alerta, mas não falha.
- **FR-022**: O relatório MUST rodar localmente, sobre os dados extraídos da ROM real, por linha
  de comando, e MUST NOT ser exigido pela integração contínua.

**Testes**

- **FR-023**: Os testes MUST usar dados binários sintéticos, montados pelos próprios testes no
  formato original, e MUST NOT depender da ROM real (princípio II).

### Key Entities

- **Espécie**: identificador (número nacional), referência ao nome, stats base, tipos,
  habilidades, taxa de captura, experiência base, EVs, proporção de gênero, grupo de crescimento,
  grupos de ovo, itens segurados; lista de formas alternativas.
- **Forma alternativa**: identificador próprio, espécie base, número da forma, mesmos campos da
  espécie.
- **Golpe**: identificador, referência ao nome, tipo, categoria, poder, precisão, PP,
  prioridade, alvo, flags, efeito original e chance do efeito.
- **Learnset**: por espécie ou forma: listas por nível, TM/HM, ovo e tutor, referenciando golpes.
- **Evolução**: espécie de origem, espécie de destino, método original e condição.
- **Item**: identificador, referência ao nome, preço, bolso, uso no campo, uso no combate e
  efeito original.
- **Tipo** e **tabela de tipos**: tipos do jogo e multiplicador de cada par.
- **Natureza**: identificador, stat aumentado e stat diminuído.
- **Habilidade**: identificador e referência ao nome (o comportamento é implementado no jogo).
- **Curva de experiência**: grupo de crescimento e experiência total por nível.
- **Relatório de sanidade**: contagens obtidas e esperadas, erros de schema e alertas de faixa.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com a ROM real, o relatório de sanidade fecha 100% das contagens esperadas, com
  zero erros de schema.
- **SC-002**: Uma amostra de 10 Pokémon (incluindo pelo menos uma forma alternativa e uma espécie
  sem gênero) e 10 golpes (incluindo um de status, um que nunca erra e um de poder variável),
  conferida manualmente contra fontes de referência, bate em 100% dos campos.
- **SC-003**: Duas extrações seguidas da mesma ROM geram arquivos de dados idênticos byte a byte.
- **SC-004**: Um arquivo de dados com um campo inválido introduzido à mão é recusado no
  carregamento em 100% dos casos testados, com arquivo, caminho do campo e problema na
  mensagem.
- **SC-005**: Simulando uma atualização que muda só a etapa de golpes, apenas ela e as etapas
  que dependem dela rodam de novo.
- **SC-006**: A extração dos dados acrescenta no máximo 30 segundos à preparação do jogo num PC
  Windows modesto.

## Assumptions

- **Dependência**: a feature 003 (pipeline e etapa de desempacotamento) está concluída; estas
  etapas consomem as saídas dela.
- **Nomes**: o catálogo de textos é a feature 005. Até ela existir, os registros guardam só a
  referência (o índice do texto no jogo original); o relatório e a conferência manual usam os
  números da Pokédex e dos golpes, que são públicos.
- **Habilidades**: a ROM não tem dados mecânicos de habilidades, só o comportamento no código do
  jogo. Por isso a lista de habilidades tem só identificador e referência ao nome; o
  comportamento será implementado no jogo, guiado pelo identificador.
- **Identificadores**: o identificador de espécie é o número da Pokédex nacional; o de golpe,
  item, habilidade e natureza é o índice original. Formas alternativas recebem identificador
  derivado da espécie e do número da forma. Esses índices não mudam entre extrações da mesma ROM.
- **Contagens esperadas**: os valores do FR-019 que não foram citados no pedido (habilidades,
  itens, TMs/HMs, formas) são definidos no plano a partir de fontes de referência públicas e
  conferidos com a ROM real.
- **Fontes de referência**: usadas só para conferir a amostra (SC-002) e as contagens, nunca como
  origem de dados.
- **Desempenho**: a meta de 30 s (SC-006) vale para a máquina de referência usada nas medições da
  feature 003.
- **Fora do escopo**: mapeamento de golpes para arquétipos de tempo real (spec 13), treinadores e
  tabelas de encontro (spec 8), textos (spec 5) e qualquer ajuste de balanceamento.
