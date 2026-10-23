# Feature Specification: Fundação do projeto

**Feature Branch**: `001-project-foundation`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Fundação do projeto: a base do repositório sobre a qual todos os
specs seguintes serão construídos. Nenhuma funcionalidade de jogo entra aqui; o objetivo é provar
a arquitetura definida na constituição com o menor código possível."

## Contexto

Todos os marcos do SoulSilver Desktop dependem de uma estrutura confiável: pacotes separados,
checagens automáticas, regras de segurança do app desktop e proteção contra versionar assets.
Errar isso depois custa caro, porque cada spec futuro herda essas decisões. Esta feature entrega
só o esqueleto do repositório e uma prova de ponta a ponta da arquitetura descrita na
constituição (princípios II, IV, V, VI e IX). Não inclui nenhuma funcionalidade de jogo.

O único usuário desta feature é o **desenvolvedor** do projeto, incluindo os agentes de IA que
trabalham sob a supervisão dele.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Do clone ao app aberto (Priority: P1)

O desenvolvedor clona o repositório num PC Windows, instala as dependências e abre o app
seguindo poucos comandos documentados no README, sem nenhuma configuração manual além do que o
README pede.

**Why this priority**: sem isso, nenhuma outra história pode ser demonstrada. É a porta de
entrada de todo o trabalho futuro.

**Independent Test**: num Windows limpo, com apenas os pré-requisitos listados no README
instalados, seguir o README do início ao fim e cronometrar até a janela do app aparecer.

**Acceptance Scenarios**:

1. **Given** um clone limpo do repositório e os pré-requisitos do README instalados,
   **When** o desenvolvedor executa os comandos de instalação e de execução do README,
   **Then** a janela de placeholder do app abre.
2. **Given** um pré-requisito ausente ou em versão incompatível,
   **When** o desenvolvedor executa a instalação,
   **Then** o processo falha com uma mensagem que diz qual pré-requisito falta e qual versão é
   esperada.

---

### User Story 2 - Caminho completo renderer → servidor de jogo (Priority: P2)

Ao abrir, a janela de placeholder pede ao servidor de jogo uma informação de exemplo (versão do
app e estado do servidor) e mostra a resposta. A janela também mostra um contador de ticks do
servidor avançando em tempo real. Isso prova o caminho completo: interface isolada → API exposta
de forma controlada → processo principal do app → servidor de jogo em processo ou thread
separado → resposta de volta à interface.

**Why this priority**: valida as decisões arquiteturais mais caras de mudar depois (servidor
autoritativo isolado, contrato compartilhado e interface isolada).

**Independent Test**: abrir o app e observar a janela: a resposta do servidor aparece e o
contador de ticks avança a cerca de 20 por segundo. Inspecionar a interface e confirmar que ela
não tem acesso direto a arquivos, rede ou recursos do sistema.

**Acceptance Scenarios**:

1. **Given** o app aberto, **When** a janela termina de carregar,
   **Then** ela mostra a versão do app e o estado do servidor recebidos do servidor de jogo.
2. **Given** o app aberto há 10 segundos, **When** o desenvolvedor observa o contador de ticks,
   **Then** o contador avançou cerca de 200 ticks (20 por segundo, com tolerância de ±5%).
3. **Given** a interface do app, **When** ela tenta acessar arquivos, rede, recursos do sistema
   ou carregar conteúdo remoto diretamente, **Then** o acesso é negado.
4. **Given** o servidor de jogo indisponível ou encerrado,
   **When** a janela pede a informação de exemplo,
   **Then** a janela mostra um estado de erro claro em vez de travar ou ficar em branco.

---

### User Story 3 - Checagens com um único comando (Priority: P3)

O desenvolvedor roda typecheck, lint e testes de todo o monorepo, cada um com um único comando,
para validar qualquer mudança antes do commit.

**Why this priority**: a constituição proíbe concluir tasks sem essas checagens passando. Sem
comandos únicos, essa regra não é praticável.

**Independent Test**: rodar cada um dos três comandos na raiz do repositório e confirmar que
cobrem os cinco pacotes; introduzir um erro proposital em um pacote e confirmar que o comando
correspondente falha apontando o pacote.

**Acceptance Scenarios**:

1. **Given** o repositório sem erros, **When** o desenvolvedor roda o comando de typecheck, de
   lint ou de testes, **Then** cada comando passa e cobre os pacotes app, client, server, shared
   e extractor.
2. **Given** um erro de tipo, de lint ou um teste falhando em qualquer pacote,
   **When** o comando correspondente é executado,
   **Then** ele termina com falha e identifica o pacote e o arquivo com problema.
3. **Given** a execução dos testes, **When** o relatório é exibido,
   **Then** cada um dos cinco pacotes aparece com pelo menos um teste executado.

---

### User Story 4 - Bloqueio de ROM e assets no commit (Priority: P4)

O desenvolvedor tenta commitar, por engano, uma ROM, um arquivo da pasta de assets ou um arquivo
em formato extraído do DS. O commit é recusado com uma mensagem clara explicando o motivo.

**Why this priority**: o princípio II da constituição exige que o repositório nunca contenha
material da Nintendo. A proteção precisa existir antes do primeiro trabalho no extrator.

**Independent Test**: num clone recém-preparado, tentar commitar cada tipo de arquivo proibido e
confirmar a recusa; tentar commitar um arquivo da pasta de arte própria e confirmar que passa.

**Acceptance Scenarios**:

1. **Given** um arquivo `.nds` adicionado ao commit, **When** o desenvolvedor tenta commitar,
   **Then** o commit falha com uma mensagem que nomeia o arquivo e explica que ROMs não podem ser
   versionadas.
2. **Given** qualquer arquivo dentro da pasta de saída de assets, **When** o desenvolvedor tenta
   commitar, **Then** o commit falha com a mesma explicação.
3. **Given** um arquivo em formato extraído do DS fora da pasta de assets,
   **When** o desenvolvedor tenta commitar, **Then** o commit falha com a mesma explicação.
4. **Given** uma imagem original do projeto dentro da pasta de arte própria permitida,
   **When** o desenvolvedor commita, **Then** o commit passa.
5. **Given** um clone novo, **When** o desenvolvedor segue apenas a instalação do README,
   **Then** a proteção já está ativa, sem passo manual extra.

---

### User Story 5 - Checagens automáticas em cada push (Priority: P5)

A cada push, as checagens (typecheck, lint, testes e verificação de assets proibidos) rodam
automaticamente num ambiente Windows, e o resultado fica visível para o desenvolvedor.

**Why this priority**: rede de segurança para quando o desenvolvedor esquece de rodar as
checagens localmente ou contorna a proteção local.

**Independent Test**: fazer push de um commit válido e ver as checagens passarem; fazer push de
um commit com teste falhando e ver as checagens falharem.

**Acceptance Scenarios**:

1. **Given** um push com o código válido, **When** a integração contínua termina,
   **Then** todas as checagens aparecem como aprovadas, executadas em Windows.
2. **Given** um push com erro de tipo, de lint ou teste falhando,
   **When** a integração contínua termina, **Then** ela aparece como reprovada e indica a
   checagem que falhou.
3. **Given** um push com um arquivo proibido que contornou a proteção local,
   **When** a integração contínua termina, **Then** ela aparece como reprovada e nomeia o arquivo.

---

### Edge Cases

- **Extensão em maiúsculas ou mista** (`.NDS`, `.Nds`): MUST ser recusada como `.nds`.
- **Proteção local contornada** (por exemplo, commit com a verificação desativada): a
  integração contínua MUST detectar o arquivo proibido e reprovar.
- **Arquivo renomeado ou movido** para dentro da pasta de assets: MUST ser recusado.
- **Pasta de assets inexistente** num clone novo: o app e as checagens MUST funcionar
  normalmente; a pasta é criada quando necessária.
- **Servidor de jogo encerra inesperadamente** com o app aberto: a janela MUST mostrar estado de
  erro e o contador MUST parar, sem travar a janela.
- **Interface ocupada ou janela minimizada**: o servidor MUST continuar contando ticks no ritmo
  de 20 por segundo; ao voltar, o contador reflete os ticks decorridos.
- **Versão divergente** entre o contrato usado pela interface e pelo servidor: impossível por
  construção, pois ambos usam a mesma definição compartilhada; qualquer divergência MUST falhar
  no typecheck.

## Requirements *(mandatory)*

### Functional Requirements

**Estrutura e checagens**

- **FR-001**: O repositório MUST ser um monorepo com os pacotes `app`, `client`, `server`,
  `shared` e `extractor`, conforme as Restrições Técnicas da constituição.
- **FR-002**: Cada pacote MUST ter pelo menos um teste trivial que prove que o pipeline de testes
  funciona naquele pacote.
- **FR-003**: MUST existir um único comando, na raiz, para cada checagem: typecheck, lint e
  testes, cada um cobrindo todos os pacotes.
- **FR-004**: Todo o código MUST passar no typecheck em modo estrito.
- **FR-005**: MUST existir uma convenção documentada de pasta para fixtures sintéticos de teste,
  e os testes MUST NOT depender de dados reais da ROM.

**Prova de arquitetura**

- **FR-006**: O app MUST abrir uma janela de placeholder que pede ao servidor de jogo uma
  informação de exemplo (versão do app e estado do servidor) e mostra a resposta.
- **FR-007**: A chamada de exemplo e sua resposta MUST ser definidas uma única vez, de forma
  tipada, no pacote `shared`, e a interface, o processo principal e o servidor MUST usar essa
  mesma definição.
- **FR-008**: O servidor de jogo MUST rodar fora do processo da interface e fora da thread que
  gerencia as janelas.
- **FR-009**: O servidor de jogo MUST rodar um loop de tick fixo de 20 Hz que, nesta feature,
  apenas conta ticks.
- **FR-010**: A janela de placeholder MUST mostrar o contador de ticks atualizado continuamente.
- **FR-011**: A lógica do servidor (loop de tick e resposta à chamada de exemplo) MUST ser
  testável sem abrir o app nem a interface.
- **FR-012**: A janela MUST mostrar um estado de erro claro quando o servidor não responde.

**Segurança do app (princípio IX)**

- **FR-013**: A interface MUST rodar isolada: sem acesso direto a Node, arquivos, rede ou recursos
  do sistema.
- **FR-014**: Toda comunicação da interface com o resto do app MUST passar por uma API tipada e
  restrita, exposta de forma controlada; a interface MUST NOT ter acesso a nada além dessa API.
- **FR-015**: A interface MUST NOT carregar conteúdo remoto; tentativas de navegação ou de
  abertura de páginas externas MUST ser bloqueadas.

**Proteção de assets (princípio II)**

- **FR-016**: MUST existir uma pasta de saída de assets ignorada pelo controle de versão.
- **FR-017**: Uma verificação de pre-commit MUST recusar: arquivos `.nds` (sem diferenciar
  maiúsculas e minúsculas); qualquer arquivo dentro da pasta de saída de assets; e arquivos nos
  formatos extraídos do DS listados nas Assumptions.
- **FR-018**: A mensagem de recusa MUST nomear cada arquivo bloqueado e explicar que ROMs,
  assets e dados derivados da ROM não podem ser versionados (princípio II).
- **FR-019**: MUST existir uma pasta explicitamente permitida para arte original do projeto
  (ícones e UI), cujos arquivos de imagem passam na verificação.
- **FR-020**: A verificação de pre-commit MUST ficar ativa automaticamente após a instalação das
  dependências, sem passo manual.
- **FR-021**: A mesma verificação de arquivos proibidos MUST rodar na integração contínua sobre
  todos os arquivos versionados.

**Integração contínua**

- **FR-022**: Cada push MUST disparar automaticamente typecheck, lint, testes e a verificação de
  arquivos proibidos num ambiente Windows.
- **FR-023**: O resultado da integração contínua MUST indicar qual checagem falhou.

**Documentação**

- **FR-024**: MUST existir um README em PT-BR explicando pré-requisitos, preparação do ambiente,
  como rodar o app e como rodar cada checagem.
- **FR-025**: MUST existir `docs/balance-log.md` com o modelo de registro de desvios de
  balanceamento: valor original, valor novo e motivo (princípio I).

### Key Entities

- **Pacote**: unidade do monorepo (`app`, `client`, `server`, `shared`, `extractor`), com
  responsabilidade definida pela constituição e seus próprios testes.
- **Contrato da chamada de exemplo**: definição compartilhada do pedido e da resposta (versão
  do app, estado do servidor, contador de ticks), usada pelas duas pontas.
- **Estado do servidor**: situação do servidor de jogo exibida na janela (por exemplo, rodando
  ou parado) e o número de ticks contados desde o início.
- **Regra de arquivo proibido**: extensão ou pasta bloqueada no commit, com a mensagem
  explicativa associada.
- **Pasta de arte própria**: local permitido para imagens originais do projeto.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Partindo de um clone limpo num Windows com os pré-requisitos do README, o
  desenvolvedor chega à janela do app aberta em menos de 15 minutos seguindo apenas o README.
- **SC-002**: A janela mostra a resposta do servidor em até 3 segundos após abrir.
- **SC-003**: Em 10 segundos de observação, o contador de ticks avança entre 190 e 210.
- **SC-004**: Typecheck, lint e testes passam localmente e na integração contínua, com os cinco
  pacotes cobertos pelos testes.
- **SC-005**: 100% das tentativas de commitar um arquivo `.nds`, um arquivo da pasta de assets
  ou um formato extraído do DS da lista falham com a mensagem explicativa.
- **SC-006**: 100% dos arquivos de imagem na pasta de arte própria passam na verificação.
- **SC-007**: A integração contínua reporta o resultado de cada push sem ação manual do
  desenvolvedor.

## Assumptions

- **Formatos extraídos do DS bloqueados** (sem diferenciar maiúsculas e minúsculas): `.nds`,
  `.narc`, `.arc`, `.ncgr`, `.nclr`, `.nscr`, `.ncer`, `.nanr`, `.nmcr`, `.nmar`, `.nsbmd`,
  `.nsbtx`, `.nsbca`, `.nsbta`, `.nsbtp`, `.nsbma`, `.nsbva`, `.sdat`, `.sseq`, `.ssar`,
  `.sbnk`, `.swar`, `.strm`, `.bmg`. A lista pode crescer em specs futuros (como o do extrator)
  sem exigir emenda à constituição.
- **Pastas**: a pasta de saída de assets fica na raiz do repositório, para uso da CLI de
  desenvolvimento; no app instalado, os assets ficam na pasta de dados do usuário (princípio II).
  Os nomes exatos das pastas de assets, de arte própria e de fixtures são definidos no plano.
- **Repositório git**: o diretório ainda não é um repositório git; esta feature assume que ele
  será inicializado como repositório git hospedado no GitHub, onde roda a integração contínua.
- **Pré-requisitos**: o desenvolvedor tem um Windows 10 ou 11 de 64 bits com acesso à internet
  para baixar dependências; o README lista as ferramentas e versões necessárias.
- **Integração contínua**: roda em todos os branches a cada push e também em pull requests.
- **Estado do servidor**: nesta feature, o estado se resume a "rodando" com o contador de ticks;
  estados mais ricos vêm com o núcleo do jogo.
- **Fora do escopo**: instalador, auto-update, extrator funcional, renderização do jogo, rede
  entre jogadores e qualquer funcionalidade de jogo. O pacote `extractor` existe apenas como
  esqueleto com teste trivial.
