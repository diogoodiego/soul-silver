# Feature Specification: Textos e i18n

**Feature Branch**: `005-text-catalog`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Textos e i18n: etapa do extrator que decodifica os bancos de
mensagens da ROM e gera o catálogo de textos do jogo, já estruturado para tradução futura."

## Contexto

Diálogos, nomes, descrições e menus vêm da ROM do jogador (princípios I e II). Os bancos de
mensagens da Gen 4 são criptografados e usam códigos de controle próprios: nome do jogador,
variáveis, cores, quebras de página. Sem convertê-los para um formato neutro, nenhum script ou
menu consegue exibir texto.

Esta feature acrescenta uma etapa ao pipeline de extração (features 003 e 004). Ela também
resolve as referências de nome que a feature 004 deixou nos dados (`species-names`,
`move-names`, `item-names`, `ability-names`, `type-names`, `nature-names`).

Atores:

- **Desenvolvedor de scripts e UI**: precisa exibir textos e preencher variáveis.
- **Futuro tradutor**: traduz o jogo sem mexer em código.
- **Desenvolvedor (depuração)**: parte de um trecho que viu no jogo e quer achar o texto de
  origem.
- **Jogador**: não interage com esta feature. O catálogo é gerado durante a preparação do jogo.

Termos:

- **Banco de mensagens**: arquivo da ROM que agrupa muitos textos, numerados a partir de 0.
- **Texto**: uma entrada de um banco.
- **Código de controle**: marca dentro do texto original que não é caractere, como "mostre o
  nome do jogador" ou "mude a cor".
- **Marcação neutra**: a forma documentada e independente da ROM em que os códigos de controle
  passam a aparecer no catálogo.
- **Identificador**: o nome estável de um texto, formado por banco e índice.
- **Catálogo**: o conjunto de textos de um idioma.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Buscar um texto por identificador e preencher as variáveis (Priority: P1)

O desenvolvedor de scripts ou de UI pede um texto pelo identificador (por exemplo, o nome de
uma espécie ou uma fala de um mapa) e recebe o texto com as variáveis marcadas. Ele informa os
valores (nome do jogador, nome de um Pokémon, um número) e obtém a frase pronta. Se esquecer
alguma variável, recebe um erro dizendo qual.

**Why this priority**: sem isso nenhum script, menu ou nome de Pokémon aparece na tela. É o
mínimo que desbloqueia o resto do jogo.

**Independent Test**: com bancos sintéticos, extrair o catálogo, buscar textos por identificador
e preencher variáveis; com a ROM real, conferir a amostra de New Bark Town (SC-002).

**Acceptance Scenarios**:

1. **Given** o catálogo extraído, **When** o desenvolvedor busca um texto por banco e índice,
   **Then** recebe o texto decodificado, com acentos e símbolos corretos.
2. **Given** um texto com a variável do nome do jogador, **When** o desenvolvedor o formata
   informando o nome, **Then** recebe a frase com o nome no lugar da variável.
3. **Given** um texto com duas variáveis, **When** o desenvolvedor informa só uma, **Then** a
   formatação falha com uma mensagem que nomeia a variável ausente e o identificador do texto.
4. **Given** um texto com a marcação de quebra de página, de quebra de linha, de cor e de
   espera por input, **When** o desenvolvedor o lê, **Then** cada uma aparece com a marcação
   neutra documentada e nenhum caractere de controle da ROM.
5. **Given** um banco cujo conteúdo é conhecido (nomes de espécies, golpes, itens, habilidades,
   tipos ou naturezas), **When** o desenvolvedor busca por um nome legível do banco, **Then**
   encontra o mesmo texto que obteria pelo número do banco.
6. **Given** os dados da feature 004, **When** o desenvolvedor segue a referência de nome de uma
   espécie, de um golpe ou de um item, **Then** chega ao texto correto no catálogo.
7. **Given** um identificador que não existe, **When** o desenvolvedor o busca, **Then** recebe
   um erro claro com o identificador pedido, nunca um texto vazio.

---

### User Story 2 - Catálogo por idioma, editável e com fallback (Priority: P2)

O futuro tradutor encontra o catálogo de inglês em arquivos de texto editáveis, organizados por
idioma. Para traduzir, ele cria um catálogo paralelo para o novo idioma contendo só as chaves
que traduziu. Chaves que faltam no novo idioma aparecem em inglês.

**Why this priority**: a tradução é futura, mas a estrutura precisa existir desde já para que
scripts e UI nunca dependam de textos fixos em inglês no código.

**Independent Test**: criar um catálogo paralelo sintético com poucas chaves e conferir a busca
com fallback; editar um texto do catálogo de inglês e conferir que o resultado muda sem tocar
em código.

**Acceptance Scenarios**:

1. **Given** o catálogo de inglês extraído, **When** o tradutor abre a pasta do idioma, **Then**
   encontra arquivos de texto legíveis, um por banco, com identificador e texto lado a lado.
2. **Given** um catálogo paralelo que traduz só algumas chaves, **When** o desenvolvedor busca
   uma chave traduzida, **Then** recebe o texto traduzido.
3. **Given** o mesmo catálogo paralelo, **When** o desenvolvedor busca uma chave que não foi
   traduzida, **Then** recebe o texto em inglês.
4. **Given** uma tradução que remove ou renomeia uma variável de um texto, **When** o catálogo é
   carregado, **Then** o carregamento falha apontando o texto, a variável e o problema, antes
   que o erro apareça no jogo.
5. **Given** um catálogo com um campo inválido, **When** é carregado, **Then** o erro diz o
   arquivo, o caminho do campo e o problema (princípio III).

---

### User Story 3 - Achar o identificador de um trecho (Priority: P3)

O desenvolvedor vê uma fala no jogo, digita um trecho dela numa ferramenta de busca e descobre
o banco, o índice e o texto completo. Assim depura um evento sem vasculhar arquivos.

**Why this priority**: acelera o desenvolvimento dos eventos e da UI, mas o catálogo já é útil
sem ela.

**Independent Test**: buscar trechos conhecidos num catálogo sintético, com e sem diferença de
maiúsculas e acentos, e conferir os resultados.

**Acceptance Scenarios**:

1. **Given** o catálogo extraído, **When** o desenvolvedor busca um trecho, **Then** recebe a
   lista de textos que o contêm, cada um com identificador e o texto.
2. **Given** um trecho que aparece em vários textos, **When** o desenvolvedor busca, **Then**
   recebe todos, em ordem de banco e índice, com um limite configurável de resultados.
3. **Given** um trecho que cruza uma quebra de linha ou de página, **When** o desenvolvedor o
   busca como o texto aparece na tela, **Then** o encontra.
4. **Given** um trecho que não existe, **When** o desenvolvedor busca, **Then** a ferramenta diz
   que não encontrou nada.

---

### Edge Cases

- **Código de controle desconhecido**: é preservado literalmente na marcação, listado no
  relatório da extração e nunca descartado. A extração não falha por causa dele.
- **Caractere sem correspondência na tabela de caracteres**: preservado da mesma forma e listado.
- **Texto vazio**: continua existindo, com o identificador e o texto vazio.
- **Banco vazio ou com um só texto**: decodificado normalmente.
- **Entradas que parecem alternar variações** (por exemplo, textos que o jogo escolhe conforme
  gênero ou número): são tratadas como textos separados, cada um com o próprio índice.
- **Símbolos próprios do jogo** (♂, ♀, reticências, aspas curvas, símbolos de pontuação
  especiais): têm representação definida e estável.
- **Texto com variável repetida ou aninhada em outra marcação**: a marcação continua válida e a
  formatação preenche todas as ocorrências.
- **Banco corrompido ou truncado**: a etapa falha com mensagem que nomeia o banco e o problema;
  nenhum catálogo parcial é marcado como pronto.
- **Reextração**: a mesma ROM gera catálogos idênticos byte a byte.
- **Texto que contém a própria marcação neutra como caractere literal** (por exemplo, chaves):
  é protegido para que a leitura da marcação nunca confunda texto com código.
- **Idioma sem catálogo**: pedir um idioma que não existe usa o inglês e informa que o idioma
  não foi encontrado.

## Requirements *(mandatory)*

### Functional Requirements

**Decodificação**

- **FR-001**: A extração MUST decodificar todos os bancos de mensagens da ROM, aplicando a
  decifragem e a tabela de caracteres do jogo.
- **FR-002**: A tabela de caracteres MUST cobrir letras com acento, símbolos e pontuação do
  inglês dos EUA, e MUST ser parte do código do extrator, nunca extraída de outra fonte.
- **FR-003**: Os códigos de controle MUST virar uma marcação neutra, documentada num único lugar,
  que cobre ao menos: variáveis nomeadas (nome do jogador, do rival, de Pokémon, de item, de
  golpe, de tipo e números), cores, quebra de linha, quebra de página, espera por input e
  limpeza da caixa de texto.
- **FR-004**: Um código de controle ou caractere desconhecido MUST ser preservado na marcação em
  forma literal e MUST ser listado no relatório da extração com banco, índice e valor.
- **FR-005**: Decodificar e recodificar um banco MUST gerar o binário original, byte a byte,
  incluindo a ordem das entradas, a semente da cifra e o preenchimento.

**Identificadores e nomes**

- **FR-006**: Cada texto MUST ter um identificador estável formado por banco e índice,
  derivado dos números originais, que não muda entre reextrações nem entre versões do app.
- **FR-007**: Os bancos cujo conteúdo é conhecido MUST ter também um nome legível: espécies,
  golpes, itens, habilidades, tipos, naturezas e os diálogos de cada mapa onde for possível
  determinar o mapa. Buscar pelo nome legível e pelo número do banco MUST dar o mesmo texto.
- **FR-008**: Os seis catálogos de nomes que a feature 004 referencia (`species-names`,
  `move-names`, `item-names`, `ability-names`, `type-names`, `nature-names`) MUST existir com
  esses nomes, e cada referência dos dados da feature 004 MUST resolver para um texto.
- **FR-009**: Bancos sem nome legível MUST continuar acessíveis só pelo número do banco.

**Catálogo e i18n**

- **FR-010**: O catálogo gerado MUST ser o de inglês, gravado em arquivos de texto editáveis,
  um por banco, organizados por idioma.
- **FR-011**: A estrutura MUST permitir acrescentar outros idiomas como catálogos paralelos
  com apenas as chaves traduzidas; chaves ausentes MUST usar o texto em inglês.
- **FR-012**: O catálogo MUST ser validado por schema ao ser gerado e ao ser carregado, com erro
  que diz arquivo, caminho do campo e problema (princípio III). Cada arquivo MUST registrar a
  versão do próprio formato.
- **FR-013**: Ao carregar um catálogo de outro idioma, o sistema MUST verificar que cada texto
  traduzido usa exatamente as mesmas variáveis do texto em inglês e falhar com mensagem que
  nomeia o texto, a variável e o problema quando não usar.

**Formatação**

- **FR-014**: O pacote compartilhado MUST oferecer uma função que preenche as variáveis de um
  texto e valida que todas foram fornecidas, falhando com o identificador do texto e o nome da
  variável ausente. Variáveis fornecidas e não usadas MUST ser recusadas, para pegar erros de
  digitação.
- **FR-015**: As marcações de quebra de linha, quebra de página, cor e espera por input MUST
  passar pela formatação sem alteração, para a caixa de diálogo (spec 17) interpretá-las.

**Busca**

- **FR-016**: Uma ferramenta de busca de desenvolvimento, por linha de comando, MUST encontrar
  textos por trecho, ignorando diferença de maiúsculas e de acentos, e MUST mostrar identificador
  e texto de cada resultado, com limite configurável.
- **FR-017**: A busca MUST considerar o texto como aparece na tela, tratando as quebras de linha
  e de página como espaço.

**Pipeline**

- **FR-018**: O catálogo MUST ser gerado por uma etapa registrada no pipeline da feature 003,
  com versão própria, consumindo apenas as saídas da etapa de desempacotamento. Uma atualização
  que muda essa etapa MUST reextrair só ela e as que dependem dela, sem pedir a ROM.
- **FR-019**: Duas extrações da mesma ROM MUST gerar arquivos idênticos byte a byte.
- **FR-020**: A etapa MUST gerar um relatório com o número de bancos e de textos decodificados e a
  lista dos códigos e caracteres desconhecidos, e MUST falhar se algum banco não puder ser
  lido. Códigos desconhecidos geram alerta, não falha.
- **FR-021**: A extração MUST gravar o texto original da ROM, sem correções, adaptações ou
  tradução (princípio I).

**Testes**

- **FR-022**: Os testes MUST usar bancos de mensagens sintéticos, cifrados pelos próprios
  testes, e MUST NOT depender da ROM real (princípio II).

### Key Entities

- **Banco de mensagens**: número original, nome legível (quando conhecido) e lista de textos.
- **Texto**: identificador (banco + índice), conteúdo em marcação neutra e, derivado dele, a
  lista de variáveis que exige.
- **Marcação neutra**: vocabulário documentado de variáveis, cores, quebras e espera por input,
  mais a forma literal para o que é desconhecido.
- **Variável**: nome, tipo de valor (texto ou número) e, quando existir, rótulo documentado.
- **Catálogo de idioma**: idioma, versão do formato e conjunto de bancos; o de inglês é
  completo, os demais são parciais.
- **Resolução com fallback**: regra que devolve o texto no idioma pedido ou, na falta dele, em
  inglês.
- **Relatório de extração de textos**: contagens de bancos e textos, códigos e caracteres
  desconhecidos e referências sem destino.
- **Resultado de busca**: identificador, nome legível do banco e texto.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com a ROM real, 100% dos bancos são decodificados e nenhum caractere ou código fica
  sem tratamento: o que não for reconhecido aparece preservado e listado no relatório, e o
  relatório fecha sem falhas.
- **SC-002**: Uma amostra de diálogos de New Bark Town, conferida contra o jogo original, bate
  palavra por palavra, incluindo as variáveis, em 100% dos textos da amostra.
- **SC-003**: Em 100% dos bancos, decodificar e recodificar gera o binário original byte a byte.
- **SC-004**: 100% das referências de nome dos dados da feature 004 (espécies, golpes, itens,
  habilidades, tipos e naturezas) resolvem para um texto, e a amostra de SC-002 da feature 004
  mostra o nome correto em cada item.
- **SC-005**: Duas extrações seguidas da mesma ROM geram catálogos idênticos byte a byte.
- **SC-006**: Um catálogo paralelo com 10% das chaves traduzidas devolve 100% das chaves: as
  traduzidas no idioma novo e as demais em inglês.
- **SC-007**: Uma tradução que altera as variáveis de um texto é recusada no carregamento em
  100% dos casos testados.
- **SC-008**: A busca por um trecho no catálogo completo responde em menos de 2 segundos.
- **SC-009**: A etapa de textos acrescenta no máximo 30 segundos à preparação do jogo num PC
  Windows modesto.

## Assumptions

- **Dependência**: as features 003 e 004 estão concluídas. A etapa consome o desempacotamento da
  003 e os nomes de catálogo da 004.
- **Idioma**: a ROM aceita é a dos EUA, em inglês. O catálogo gerado é o de `en`.
- **Identificador**: banco + índice, com o número do banco igual ao do membro original. O
  formato textual exato do identificador e da marcação neutra é decidido no plano.
- **Nomes legíveis dos bancos**: valem para o que o conteúdo identifica com segurança. Os
  diálogos por mapa são nomeados quando a ligação entre mapa e banco puder ser determinada a
  partir dos dados da ROM; os demais ficam só com o número.
- **Variações por gênero ou número**: o jogo original as guarda como textos separados, e esta
  feature mantém assim.
- **Marcação nos arquivos editáveis**: um tradutor edita texto simples; a marcação neutra é
  escrita de forma legível e documentada para ele.
- **Amostra manual**: a conferência de New Bark Town (SC-002) é feita por uma pessoa contra o jogo
  original, como a amostra da feature 004.
- **Desempenho**: a meta de 30 s vale para a máquina de referência usada nas features 003 e 004.
- **Fora do escopo**: tradução para PT-BR, renderização da caixa de diálogo (spec 17), fontes,
  scripts de eventos (que usam estes textos) e qualquer ajuste ao texto original.
