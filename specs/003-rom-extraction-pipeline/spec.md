# Feature Specification: Validação da ROM, desempacotamento e primeira execução

**Feature Branch**: `003-rom-extraction-pipeline`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Validação da ROM, desempacotamento e primeira execução: a etapa
inicial do extrator e a tela que conduz o jogador desde a primeira abertura do app até ter os
assets prontos. Este spec também cria o pipeline de extração em etapas, no qual os specs
seguintes do Marco 1 vão plugar suas próprias etapas."

## Contexto

Pelo princípio II, nenhum asset é distribuído: tudo nasce da ROM do próprio jogador. Esta é a
porta de entrada do jogo inteiro e precisa ser clara para quem não entende de ROMs. É também o
primeiro passo do Marco 1 (extrator, princípio XI): o pipeline em etapas criado aqui recebe, nos
specs 4 a 9, as etapas de conversão de dados, textos, mapas, sprites e áudio.

Atores:

- **Jogador**: amigo que instala o app e possui a própria cópia do jogo, sem conhecimento
  técnico sobre ROMs.
- **Desenvolvedor**: roda o extrator por linha de comando durante o desenvolvimento e escreve
  novas etapas.

Termos:

- **ROM**: o arquivo do cartucho de Nintendo DS que o jogador fornece.
- **Sistema de arquivos do DS**: a estrutura de pastas e arquivos empacotada dentro da ROM.
- **NARC**: contêiner do DS que agrupa vários arquivos num só; a maior parte do conteúdo do jogo
  está dentro deles.
- **Etapa**: unidade independente do pipeline que transforma entradas em saídas.
- **Área de trabalho intermediária**: pasta dentro dos dados do usuário onde ficam as saídas
  brutas (ainda não convertidas) que as etapas seguintes consomem.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Primeira execução guiada (Priority: P1)

O jogador abre o app pela primeira vez. Como não há assets prontos, o app mostra uma tela de
boas-vindas que explica, em linguagem simples, que o jogo precisa da ROM de Pokémon SoulSilver
(EUA) do próprio jogador e que nada é enviado para fora do PC. O jogador clica em "Escolher
arquivo" ou arrasta o arquivo para a janela. O app valida o arquivo, guarda uma cópia, mostra a
etapa atual e a porcentagem da extração e, ao final, mostra "Assets prontos" e segue para o
jogo, sem nenhum passo fora do app.

**Why this priority**: sem assets não existe jogo. É o único caminho pelo qual um jogador chega
a jogar e é o MVP do Marco 1.

**Independent Test**: num app sem dados de usuário, com uma ROM sintética que o teste registra
como válida, ir da tela de boas-vindas até "Assets prontos" usando só a interface.

**Acceptance Scenarios**:

1. **Given** o app aberto pela primeira vez, sem assets prontos, **When** a janela aparece,
   **Then** a tela de boas-vindas explica o que é necessário (Pokémon SoulSilver, versão dos
   EUA, arquivo `.nds`) e oferece "Escolher arquivo" e a opção de arrastar o arquivo.
2. **Given** a tela de boas-vindas, **When** o jogador escolhe a ROM correta, **Then** o app
   confirma o jogo reconhecido, guarda uma cópia nos dados do usuário e inicia a extração
   automaticamente.
3. **Given** a extração em andamento, **When** o jogador olha a tela, **Then** vê o nome da
   etapa atual, a porcentagem total, e um botão "Cancelar".
4. **Given** a extração concluída com sucesso, **When** a última etapa termina, **Then** o app
   mostra "Assets prontos" e segue para a tela principal do jogo.
5. **Given** assets prontos e válidos, **When** o jogador abre o app de novo, **Then** a tela de
   boas-vindas não aparece e o app vai direto para a tela principal.
6. **Given** a extração em andamento, **When** o jogador clica em "Cancelar" e confirma,
   **Then** a extração para, nada parcial fica marcado como pronto e o app volta à tela de
   boas-vindas, onde pode recomeçar sem escolher a ROM de novo.

---

### User Story 2 - Arquivo errado recusado com mensagem clara (Priority: P1)

O jogador escolhe um arquivo que não é a ROM certa. O app recusa antes de qualquer extração e
explica o que está errado e o que é preciso fornecer, sem jargão técnico.

**Why this priority**: escolher o arquivo errado é o erro mais provável de quem não entende de
ROMs; uma mensagem genérica bloqueia o jogador e gera pedidos de ajuda. Também é exigência do
princípio II.

**Independent Test**: oferecer ao validador um conjunto de ROMs sintéticas (HeartGold, outras
regiões, outro jogo, arquivo truncado, arquivo modificado, arquivo que não é ROM) e conferir
cada mensagem.

**Acceptance Scenarios**:

1. **Given** uma ROM de Pokémon HeartGold, **When** o jogador a escolhe, **Then** o app recusa
   com a mensagem de que o arquivo é HeartGold e que o jogo precisa de SoulSilver (EUA).
2. **Given** uma ROM de SoulSilver de outra região (Europa, Japão, Coreia, etc.), **When** o
   jogador a escolhe, **Then** o app recusa nomeando a região detectada e pedindo a versão dos
   EUA.
3. **Given** uma ROM de outro jogo de DS, **When** o jogador a escolhe, **Then** o app recusa
   informando que o arquivo é outro jogo.
4. **Given** um arquivo que se identifica como SoulSilver (EUA) mas cujo conteúdo não confere
   (truncado, corrompido, modificado ou hack), **When** o jogador o escolhe, **Then** o app
   recusa informando que o arquivo está corrompido ou alterado e sugerindo gerar uma cópia nova
   do cartucho.
5. **Given** um arquivo que não é ROM de DS (imagem, documento, arquivo compactado), **When** o
   jogador o escolhe, **Then** o app recusa informando que o arquivo não é uma ROM de DS; se for
   um arquivo compactado, sugere extraí-lo antes.
6. **Given** qualquer recusa, **When** a mensagem aparece, **Then** nenhuma cópia é guardada,
   nada é extraído e o jogador pode escolher outro arquivo na mesma tela.

---

### User Story 3 - Reextração automática após atualização (Priority: P2)

O jogador atualiza o app para uma versão que mudou ou acrescentou etapas. Na abertura seguinte,
o app percebe que os assets estão desatualizados e reextrai, usando a cópia guardada da ROM,
somente as etapas que mudaram, sem pedir o arquivo de novo.

**Why this priority**: cada spec do Marco 1 e muitos ajustes posteriores vão mudar etapas; sem
isso, todo jogador teria que procurar a ROM a cada atualização.

**Independent Test**: com assets prontos, registrar uma versão nova de uma única etapa (ou
acrescentar uma etapa) e abrir o app; conferir que só aquela etapa (e as que dependem dela)
rodaram e que a ROM não foi pedida.

**Acceptance Scenarios**:

1. **Given** assets prontos e uma atualização que muda a versão de uma etapa, **When** o
   jogador abre o app, **Then** o app mostra a tela de progresso com a mensagem de que está
   atualizando os assets, roda só aquela etapa e as que dependem das saídas dela, e segue para
   a tela principal.
2. **Given** assets prontos e uma atualização que acrescenta uma etapa nova, **When** o jogador
   abre o app, **Then** só a etapa nova roda.
3. **Given** a cópia guardada da ROM ausente ou alterada, **When** uma reextração é necessária,
   **Then** o app explica que precisa da ROM de novo e volta à tela de escolha de arquivo.
4. **Given** uma saída de etapa apagada ou corrompida nos dados do usuário, **When** o app abre,
   **Then** ele detecta o problema e reextrai a etapa afetada sem pedir a ROM.

---

### User Story 4 - Interrupção sem estado inconsistente (Priority: P2)

O jogador fecha o app, o PC desliga ou o processo cai no meio da extração. Ao abrir de novo, o
app nunca usa assets pela metade: retoma a partir da primeira etapa não concluída ou refaz a
extração.

**Why this priority**: a primeira extração é o momento mais longo e mais frágil da experiência;
um estado inconsistente aqui quebraria o jogo de formas difíceis de diagnosticar.

**Independent Test**: interromper a extração em vários pontos (antes, durante e depois de cada
etapa, e durante a gravação do manifesto) e conferir que a abertura seguinte sempre termina em
"Assets prontos" com saídas íntegras.

**Acceptance Scenarios**:

1. **Given** a extração interrompida no meio de uma etapa, **When** o jogador abre o app,
   **Then** as etapas já concluídas e íntegras são mantidas, a etapa interrompida roda do zero,
   e a extração segue sem pedir a ROM.
2. **Given** uma interrupção em qualquer ponto, **When** o app verifica o estado na abertura,
   **Then** os assets só são considerados prontos se o manifesto estiver completo e cada saída
   conferir com ele.
3. **Given** o jogador fecha a janela durante a extração, **When** a confirmação aparece,
   **Then** ela avisa que a extração será retomada na próxima abertura.

---

### User Story 5 - Log de erros que o jogador consegue enviar (Priority: P3)

Quando uma extração falha, o app mostra uma mensagem simples e oferece "Abrir log" e "Tentar de
novo". O log registra o que aconteceu de forma que o desenvolvedor consiga diagnosticar, e o
jogador consegue encontrá-lo e enviá-lo.

**Why this priority**: o projeto é mantido por um desenvolvedor solo para amigos; um log fácil
de enviar é o único canal de suporte.

**Independent Test**: forçar a falha de uma etapa (por exemplo, sem permissão de gravação) e
conferir a mensagem, os botões e o conteúdo do log.

**Acceptance Scenarios**:

1. **Given** uma etapa que falha, **When** a falha acontece, **Then** o app mostra qual etapa
   falhou, uma mensagem curta em linguagem simples e as opções "Tentar de novo" e "Abrir log".
2. **Given** a opção "Abrir log", **When** o jogador clica, **Then** o explorador de arquivos
   abre com o arquivo de log selecionado.
3. **Given** o log, **When** o desenvolvedor o lê, **Then** encontra a versão do app, a data, a
   versão de cada etapa, a etapa que falhou, a mensagem de erro e o contexto técnico.
4. **Given** o log, **When** é inspecionado, **Then** ele não contém conteúdo da ROM nem dados
   extraídos.

---

### User Story 6 - Extrator por linha de comando (Priority: P3)

O desenvolvedor roda o mesmo extrator usado pelo app por linha de comando, escolhendo a ROM, a
pasta de saída e quais etapas rodar, e recebe o mesmo progresso, as mesmas validações e o mesmo
manifesto.

**Why this priority**: acelera o desenvolvimento das etapas dos specs 4 a 9 e garante, por
construção, que app e CLI não divergem.

**Independent Test**: rodar a CLI com uma ROM sintética numa pasta vazia, depois de novo
pedindo só uma etapa, e conferir saídas, manifesto e códigos de saída.

**Acceptance Scenarios**:

1. **Given** uma ROM válida e uma pasta de saída, **When** o desenvolvedor roda a CLI sem
   escolher etapas, **Then** todas as etapas registradas rodam e o manifesto é gravado na pasta
   de saída.
2. **Given** a CLI com uma lista de etapas, **When** ela roda, **Then** só essas etapas rodam,
   além das etapas das quais elas dependem que estejam ausentes ou desatualizadas.
3. **Given** uma ROM inválida, **When** a CLI roda, **Then** ela mostra a mesma mensagem
   específica do app e termina com código de saída diferente de zero, sem gravar nada.
4. **Given** uma etapa já em dia, **When** a CLI roda de novo, **Then** a etapa é pulada e a
   CLI informa isso; uma opção de forçar faz a etapa rodar mesmo assim.
5. **Given** a opção de listar etapas, **When** o desenvolvedor a usa, **Then** a CLI mostra
   cada etapa registrada com sua versão e suas dependências.

---

### Edge Cases

- **Disco cheio ou sem permissão de gravação**: a extração falha na etapa em que o problema
  ocorre, com mensagem que diz quanto espaço é necessário ou qual pasta não é gravável; nada
  parcial fica marcado como pronto. O app verifica o espaço livre antes de começar.
- **ROM apagada ou movida depois da cópia**: irrelevante, o app usa a cópia guardada.
- **ROM selecionada de um pendrive removido no meio da cópia**: a cópia é descartada e o app
  pede o arquivo de novo.
- **ROM com cabeçalho sobrescrito por ferramentas de dump ou com dados extras no fim
  ("trimmed"/"padded")**: tratada como alterada pela conferência por hash e recusada com a
  mensagem de arquivo alterado.
- **Duas instâncias do app abertas**: só uma extração roda por vez sobre os mesmos dados do
  usuário; a segunda instância espera ou informa que a extração já está em andamento.
- **Manifesto corrompido ou de formato desconhecido**: tratado como ausente; o app reextrai a
  partir da cópia guardada.
- **Manifesto de uma versão mais nova do app (downgrade)**: as etapas cuja versão difere da
  esperada pela versão instalada são reextraídas.
- **Etapa removida numa atualização**: as saídas dela são removidas da área de trabalho e do
  manifesto.
- **Etapa que lança erro inesperado**: tratada como falha daquela etapa, com registro no log;
  as etapas já concluídas permanecem válidas.
- **Arquivo muito grande ou muito pequeno para ser uma ROM de DS**: recusado como "não é uma
  ROM de DS" antes de calcular o hash completo.
- **Caminho com acentos ou caracteres especiais** (comum em nomes de usuário do Windows):
  funciona normalmente na escolha da ROM e na pasta de dados.
- **NARC malformado dentro de uma ROM válida**: não deve acontecer com a ROM conferida por
  hash; se acontecer, a etapa falha com erro no log em vez de gerar saída incompleta.

## Requirements *(mandatory)*

### Functional Requirements

**Validação da ROM**

- **FR-001**: O extrator MUST aceitar apenas a ROM de Pokémon SoulSilver (EUA), conferida pelo
  hash do arquivo completo contra um valor de referência conhecido.
- **FR-002**: Qualquer arquivo recusado MUST ser recusado antes de qualquer cópia ou extração.
- **FR-003**: A recusa MUST distinguir, com mensagens específicas em linguagem simples, pelo
  menos: (a) não é uma ROM de DS; (b) arquivo compactado; (c) outro jogo de DS; (d) Pokémon
  HeartGold; (e) SoulSilver de outra região, nomeando a região; (f) SoulSilver (EUA) corrompido,
  truncado ou modificado. Cada mensagem MUST dizer o que o jogador precisa fornecer.
- **FR-004**: A identificação de jogo e região MUST usar as informações do cabeçalho da ROM, de
  forma que o motivo da recusa seja específico mesmo quando o hash não confere.

**Cópia da ROM**

- **FR-005**: Após a validação, o app MUST guardar uma cópia da ROM na pasta de dados do
  usuário e conferir o hash da cópia antes de usá-la.
- **FR-006**: Reextrações MUST usar a cópia guardada; o app MUST pedir a ROM de novo apenas se
  a cópia estiver ausente ou não conferir.
- **FR-007**: A cópia guardada MUST NOT sair da pasta de dados do usuário nem ser incluída em
  logs.

**Pipeline de etapas**

- **FR-008**: O pipeline MUST ser composto de etapas independentes, registradas sem alterar o
  código do pipeline nem das outras etapas.
- **FR-009**: Cada etapa MUST declarar um identificador único, uma versão, suas entradas (a ROM
  ou saídas de outras etapas) e suas saídas.
- **FR-010**: O pipeline MUST determinar a ordem de execução a partir das entradas e saídas
  declaradas, e MUST recusar o registro de etapas com identificador duplicado, dependência
  inexistente ou dependência circular.
- **FR-011**: Uma etapa MUST rodar apenas quando: nunca rodou; sua versão mudou; alguma saída
  está ausente ou não confere com o hash registrado; ou alguma etapa da qual depende rodou de
  novo.
- **FR-012**: As saídas de uma etapa MUST ficar indisponíveis para o manifesto até a etapa
  terminar por completo; uma etapa interrompida MUST NOT deixar saídas que pareçam concluídas.
- **FR-013**: O pipeline MUST aceitar cancelamento a qualquer momento, parando na etapa atual
  sem marcá-la como concluída.

**Etapa de desempacotamento**

- **FR-014**: Esta feature MUST entregar a primeira etapa, que desempacota o sistema de
  arquivos do DS e o conteúdo de cada NARC para a área de trabalho intermediária, preservando a
  estrutura de pastas e a ordem dos arquivos de cada NARC.
- **FR-015**: A etapa de desempacotamento MUST NOT converter nenhum conteúdo; as saídas são os
  bytes originais, prontos para as etapas dos specs seguintes.

**Manifesto**

- **FR-016**: Ao final de cada extração bem-sucedida, o pipeline MUST gravar um manifesto com a
  versão de cada etapa, o hash de cada saída, o hash da ROM usada e a data da extração.
- **FR-017**: A gravação do manifesto MUST ser atômica: após qualquer interrupção, existe o
  manifesto anterior completo ou o novo completo, nunca um parcial.
- **FR-018**: O app MUST considerar os assets prontos somente quando o manifesto existir, for
  válido, listar todas as etapas registradas na versão esperada e todas as saídas existirem.
- **FR-019**: O manifesto MUST ter versão de formato própria, e um manifesto de formato
  desconhecido MUST ser tratado como ausente.

**Progresso e interface**

- **FR-020**: O progresso MUST mostrar o nome legível da etapa atual e uma porcentagem total,
  atualizada pelo menos uma vez por segundo enquanto houver avanço.
- **FR-021**: A primeira execução MUST ser concluída inteiramente dentro do app, sem linha de
  comando nem passos externos.
- **FR-022**: O app MUST aceitar a ROM tanto pelo seletor de arquivos quanto arrastando o
  arquivo para a janela.
- **FR-023**: Fechar o app durante a extração MUST pedir confirmação, informando que a extração
  será retomada na próxima abertura.
- **FR-024**: Ao abrir, o app MUST decidir pelo manifesto entre: ir direto ao jogo, reextrair
  automaticamente com a cópia guardada, ou mostrar a tela de escolha de ROM.

**Log**

- **FR-025**: Erros de validação e de extração MUST ser registrados num arquivo de log de texto
  na pasta de dados do usuário, com versão do app, data, versões das etapas, etapa que falhou e
  detalhes técnicos do erro.
- **FR-026**: A tela de erro MUST oferecer "Abrir log", que mostra o arquivo no explorador do
  Windows, e "Tentar de novo".
- **FR-027**: O log MUST NOT conter conteúdo da ROM nem dados extraídos, e MUST ter tamanho
  limitado, descartando as entradas mais antigas.

**Biblioteca e CLI**

- **FR-028**: O extrator MUST ser uma biblioteca que roda fora do app, sem depender do ambiente
  do app, e MUST ser a mesma usada pelo app e pela CLI (princípio II).
- **FR-029**: A CLI MUST permitir escolher a ROM, a pasta de saída e as etapas a rodar, MUST
  permitir listar as etapas registradas e forçar a execução de uma etapa, e MUST terminar com
  código de saída diferente de zero em qualquer falha.
- **FR-030**: O extrator MUST rodar sem bloquear a interface do app.

**Testes**

- **FR-031**: Os testes MUST usar ROMs e NARCs sintéticos montados pelos próprios testes, e
  MUST NOT depender da ROM real nem de dados extraídos dela (princípio II). A conferência por
  hash MUST permitir que os testes substituam o valor de referência.

### Key Entities

- **ROM do jogador**: arquivo fornecido pelo jogador; atributos: jogo e região identificados
  pelo cabeçalho, tamanho e hash.
- **Resultado da validação**: aceita ou recusada, com o motivo da recusa entre os tipos de
  FR-003 e os detalhes detectados (jogo, região).
- **Cópia guardada da ROM**: cópia conferida nos dados do usuário, usada nas reextrações.
- **Etapa**: identificador, nome legível, versão, entradas, saídas; relaciona-se com as etapas
  das quais depende.
- **Saída de etapa**: arquivo ou conjunto de arquivos na área de trabalho intermediária, com
  hash.
- **Manifesto**: versão de formato, hash da ROM, data da extração e, por etapa, versão e hashes
  das saídas. Fonte de verdade sobre "assets prontos".
- **Progresso**: etapa atual, porcentagem total e estado (validando, copiando, extraindo,
  concluído, cancelado, falhou).
- **Log de extração**: registros com data, versão do app, etapa e detalhes do erro.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com a ROM correta, uma pessoa sem conhecimento técnico vai da primeira abertura
  até "Assets prontos" sem nenhum passo fora do app, seguindo só o que a tela diz.
- **SC-002**: A validação de um arquivo (aceitar ou recusar) termina em menos de 5 segundos num
  PC Windows modesto.
- **SC-003**: A primeira extração completa desta feature (validação, cópia e desempacotamento)
  termina em menos de 2 minutos num PC Windows modesto.
- **SC-004**: 100% dos casos de recusa do FR-003 (HeartGold, cada região conhecida, outro jogo,
  arquivo corrompido, arquivo modificado, não-ROM, compactado) mostram a mensagem específica
  correspondente nos testes.
- **SC-005**: Em testes de interrupção em pelo menos 10 pontos distintos da extração (incluindo
  durante cada etapa e durante a gravação do manifesto), 100% das aberturas seguintes terminam
  em "Assets prontos" com todas as saídas conferindo com o manifesto.
- **SC-006**: Simulando uma atualização que muda a versão de uma única etapa, o app reextrai só
  aquela etapa e as que dependem dela, sem pedir a ROM, em 100% das tentativas.
- **SC-007**: Com assets prontos, abrir o app chega à tela principal sem atraso perceptível
  causado pela verificação dos assets (menos de 1 segundo a mais que sem verificação).
- **SC-008**: Para o mesmo conjunto de etapas e a mesma ROM, o app e a CLI produzem saídas e
  manifestos idênticos (exceto pela data).
- **SC-009**: Em toda falha forçada nos testes, o log contém a etapa que falhou e o erro, e não
  contém nenhum byte da ROM.

## Assumptions

- **ROM de referência**: existe uma única revisão conhecida de Pokémon SoulSilver (EUA) e o
  hash de referência é o do dump limpo e completo dessa revisão. Se surgir outra revisão
  legítima, ela é acrescentada à lista de hashes aceitos.
- **Identificação**: o jogo e a região são lidos do código de jogo no cabeçalho da ROM;
  arquivos sem cabeçalho de DS válido são "não é uma ROM de DS".
- **Arquivos compactados**: o app não descompacta arquivos; reconhece formatos comuns (zip, 7z,
  rar) só para dar a mensagem certa.
- **Verificação na abertura**: na abertura do app, a checagem rápida confere manifesto, versões,
  existência das saídas e quantidade de arquivos de cada saída; a conferência completa dos hashes das saídas acontece
  quando o pipeline decide se pula uma etapa e quando o desenvolvedor pede pela CLI. Isso
  mantém a abertura rápida (SC-007).
- **Granularidade da retomada**: a retomada é por etapa; uma etapa interrompida roda de novo do
  zero. Retomar dentro de uma etapa está fora do escopo.
- **Dependências na CLI**: pedir uma etapa pela CLI também roda as etapas das quais ela depende
  que estejam ausentes ou desatualizadas.
- **Destino após "Assets prontos"**: a tela principal atual do app (placeholder com a versão,
  criada nas features 001 e 002); os specs seguintes substituem esse destino.
- **Pasta de dados**: a mesma pasta de dados do usuário definida na feature 002, preservada
  pela desinstalação padrão; a ROM copiada, a área de trabalho, o manifesto e o log ficam lá.
- **Privacidade**: nada da ROM, dos assets ou do log é enviado pela rede; o jogador envia o log
  manualmente se quiser.
- **Idioma da interface**: os textos desta tela seguem a mesma convenção de idioma da interface
  já existente no app.
- **Fora do escopo**: conversão de qualquer conteúdo (dados, textos, mapas, sprites, áudio),
  que fica para os specs 4 a 9; suporte a outras versões ou regiões; descompactar arquivos;
  trocar a ROM guardada por outra a pedido do jogador.
