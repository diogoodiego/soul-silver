# Feature Specification: Build, distribuição e auto-update

**Feature Branch**: `002-release-autoupdate`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Build, distribuição e auto-update: transformar o app num instalador
para Windows publicado no GitHub Releases, com atualização automática, para que os amigos
instalem uma vez e fiquem sempre na mesma versão."

## Contexto

A constituição exige que apps de versões diferentes recusem a conexão (princípio VI). Sem
atualização automática, toda partida começaria com alguém desatualizado. Ter o pipeline de
publicação pronto cedo também permite testar cada marco nos PCs dos amigos desde o início
(princípio XI).

Atores:

- **Desenvolvedor**: publica versões.
- **Jogador**: amigo que instala e usa o app, sem ferramentas de desenvolvimento.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publicar uma versão com uma tag (Priority: P1)

O desenvolvedor cria uma tag de versão semântica (por exemplo, `v0.2.0`) e envia ao repositório.
A integração contínua gera o instalador, verifica que ele não contém nenhum asset e publica uma
release com o instalador e as notas de versão, sem nenhum passo manual.

**Why this priority**: sem publicação não existe instalador para os jogadores nem fonte para a
atualização automática. Todas as outras histórias dependem desta.

**Independent Test**: criar e enviar uma tag de versão; cronometrar até a release aparecer
pública com o instalador e as notas.

**Acceptance Scenarios**:

1. **Given** o código no branch principal com as checagens passando, **When** o desenvolvedor
   envia a tag `vX.Y.Z`, **Then** em menos de 20 minutos existe uma release pública `vX.Y.Z` com
   o instalador para Windows e as notas de versão.
2. **Given** uma tag cuja versão difere da versão declarada no app, **When** a publicação roda,
   **Then** ela falha com uma mensagem que mostra as duas versões, e nenhuma release é criada.
3. **Given** um arquivo de asset ou ROM incluído por engano no pacote, **When** a publicação
   roda, **Then** ela falha na verificação de conteúdo, nomeia o arquivo e nenhuma release é
   criada.
4. **Given** checagens de typecheck, lint ou testes falhando, **When** a tag é enviada,
   **Then** a publicação não acontece.
5. **Given** a release publicada, **When** o desenvolvedor abre as notas,
   **Then** elas listam as mudanças desde a release anterior, geradas a partir do histórico.

---

### User Story 2 - Instalar e abrir o app (Priority: P2)

O jogador baixa o instalador na página de releases, instala e abre o app, sem precisar de
ferramentas de desenvolvimento nem de permissão de administrador. Como o app não tem assinatura
de código, o Windows mostra o aviso do SmartScreen na primeira instalação; o README em PT-BR
explica como prosseguir.

**Why this priority**: é a porta de entrada dos jogadores; sem ela não há quem atualizar.

**Independent Test**: num PC Windows limpo, seguir apenas o README: baixar, passar pelo aviso do
SmartScreen, instalar e abrir o app.

**Acceptance Scenarios**:

1. **Given** um PC com Windows 10 ou 11 de 64 bits sem ferramentas de desenvolvimento,
   **When** o jogador segue o README, **Then** o app instala, ganha atalho no menu Iniciar e na
   área de trabalho, e abre.
2. **Given** o app aberto, **When** o jogador olha a tela inicial,
   **Then** a versão do app está visível.
3. **Given** o app instalado com saves e assets extraídos na pasta de dados do usuário,
   **When** o jogador desinstala com as opções padrão, **Then** o app é removido e a pasta de
   dados do usuário permanece intacta.
4. **Given** o aviso do SmartScreen, **When** o jogador lê o README,
   **Then** encontra o passo a passo ("Mais informações" → "Executar assim mesmo") e a explicação
   de por que o aviso aparece.

---

### User Story 3 - Atualização automática (Priority: P3)

Ao abrir o app, ele verifica se existe versão nova. Se existir, baixa em segundo plano, sem
bloquear o uso, e avisa o jogador quando o download termina. O aviso explica que versões
diferentes não conseguem jogar juntas e oferece "Reiniciar agora" ou "Depois".

**Why this priority**: mantém todos na mesma versão, condição para jogar juntos.

**Independent Test**: com uma versão N instalada e uma versão N+1 publicada, abrir o app com
internet, aceitar o aviso e confirmar que o app reabre na versão N+1.

**Acceptance Scenarios**:

1. **Given** uma versão mais nova publicada e internet disponível, **When** o jogador abre o app,
   **Then** o app abre normalmente e o download começa em segundo plano.
2. **Given** o download concluído, **When** o aviso aparece, **Then** ele mostra a versão atual
   e a nova, explica que versões diferentes não jogam juntas e oferece "Reiniciar agora" e
   "Depois".
3. **Given** o jogador escolhe "Reiniciar agora", **When** o app reinicia,
   **Then** ele abre na versão nova, sem passos adicionais.
4. **Given** o jogador escolhe "Depois", **When** ele fecha o app normalmente,
   **Then** a atualização é aplicada no fechamento e a próxima abertura já está na versão nova.
5. **Given** a versão instalada já é a mais recente, **When** o app abre,
   **Then** nenhum aviso de atualização aparece.
6. **Given** uma falha durante o download ou a aplicação da atualização (queda de rede, arquivo
   corrompido, app fechado à força), **When** o jogador abre o app de novo,
   **Then** a versão anterior abre e funciona normalmente, e a atualização é tentada de novo.

---

### User Story 4 - Jogar sem internet (Priority: P4)

Numa LAN isolada, ou com a checagem falhando por qualquer motivo, o app abre e funciona
normalmente. Um aviso discreto informa que não foi possível verificar atualizações.

**Why this priority**: a falta de internet nunca pode impedir o jogo; LAN isolada é um cenário
de uso real.

**Independent Test**: desconectar a rede e abrir o app instalado.

**Acceptance Scenarios**:

1. **Given** o PC sem conexão com a internet, **When** o jogador abre o app,
   **Then** a tela inicial aparece no mesmo tempo que com internet, e um aviso discreto informa
   que as atualizações não puderam ser verificadas.
2. **Given** o aviso discreto, **When** o jogador continua usando o app,
   **Then** o aviso não bloqueia nenhuma ação e pode ser dispensado.
3. **Given** o servidor de atualizações respondendo com erro ou lentidão,
   **When** o app abre, **Then** o comportamento é o mesmo do cenário sem internet.

---

### Edge Cases

- **Tag inválida** (`v1.2`, `1.2.3`, `v1.2.3-beta`): não publica; só tags `vMAJOR.MINOR.PATCH`
  geram release. Canais de beta estão fora do escopo.
- **Tag de uma versão já publicada**: a publicação falha sem sobrescrever a release existente.
- **Tag com versão menor que a última publicada**: a publicação falha; versões publicadas só
  crescem.
- **App instalado mais novo que a última release** (por exemplo, após apagar uma release): o app
  não oferece downgrade.
- **Duas versões publicadas enquanto o jogador estava offline**: o app atualiza direto para a
  mais recente.
- **App aberto em mais de uma janela ou instância**: só uma instância baixa e aplica a
  atualização.
- **Jogador fecha o app no meio do download**: o download recomeça na próxima abertura; a versão
  atual continua funcionando.
- **Arquivo de atualização adulterado ou incompleto**: é descartado e não é aplicado.
- **Partida em andamento**: atualização durante partida está fora do escopo; como ainda não há
  partidas, o aviso pode aparecer a qualquer momento. Specs futuros de multiplayer definem o
  adiamento.

## Requirements *(mandatory)*

### Functional Requirements

**Publicação (desenvolvedor)**

- **FR-001**: Enviar uma tag no formato `vMAJOR.MINOR.PATCH` MUST disparar automaticamente
  checagens, build, verificação de conteúdo e publicação de uma release, sem passos manuais.
- **FR-002**: A publicação MUST falhar, sem criar release, se a versão da tag for diferente da
  versão declarada no app, se a tag já tiver release, ou se for menor que a última versão
  publicada.
- **FR-003**: A publicação MUST rodar typecheck, lint e testes antes do build, e não publicar
  se algum falhar.
- **FR-004**: O build MUST falhar se o pacote final contiver qualquer ROM, arquivo da pasta de
  assets, formato extraído do DS ou mídia fora da pasta de arte própria, nomeando cada arquivo
  (princípio II). A verificação MUST inspecionar o conteúdo do pacote gerado, não só os arquivos
  versionados.
- **FR-005**: Cada release MUST ter notas de versão geradas a partir do histórico desde a
  release anterior.
- **FR-006**: Cada release MUST conter o instalador para Windows 10 e 11 de 64 bits e os arquivos
  necessários para a atualização automática.

**Instalação (jogador)**

- **FR-007**: O instalador MUST funcionar sem ferramentas de desenvolvimento e sem permissão de
  administrador, instalando apenas para o usuário atual.
- **FR-008**: O instalador MUST criar atalhos no menu Iniciar e na área de trabalho.
- **FR-009**: O app MUST mostrar a própria versão na tela inicial.
- **FR-010**: A desinstalação padrão MUST preservar a pasta de dados do usuário (saves e assets
  extraídos).
- **FR-011**: O README em PT-BR MUST explicar como baixar, instalar, passar pelo aviso do
  SmartScreen (com o motivo do aviso) e desinstalar.

**Atualização automática**

- **FR-012**: O app MUST verificar se há versão nova a cada abertura, em segundo plano, sem
  atrasar a exibição da tela inicial.
- **FR-013**: Havendo versão nova, o app MUST baixá-la em segundo plano sem bloquear o uso.
- **FR-014**: Após o download, o app MUST mostrar um aviso com a versão atual e a nova, a
  explicação de que versões diferentes não conseguem jogar juntas, e as opções "Reiniciar agora"
  e "Depois".
- **FR-015**: "Reiniciar agora" MUST aplicar a atualização e reabrir o app na versão nova;
  "Depois" MUST aplicar a atualização quando o app for fechado.
- **FR-016**: O app MUST aplicar apenas atualizações íntegras e de versão maior que a instalada;
  arquivos incompletos ou adulterados MUST ser descartados.
- **FR-017**: Uma falha no download ou na aplicação MUST manter a versão atual funcionando, e a
  atualização MUST ser tentada de novo na abertura seguinte.

**Funcionamento offline**

- **FR-018**: Sem internet, com o servidor de atualizações indisponível ou lento, o app MUST abrir
  e funcionar normalmente.
- **FR-019**: Nesses casos, o app MUST mostrar um aviso discreto e dispensável de que as
  atualizações não puderam ser verificadas, sem bloquear nenhuma ação.
- **FR-020**: A checagem de atualização MUST desistir em no máximo 15 segundos sem resposta.

### Key Entities

- **Versão**: número `MAJOR.MINOR.PATCH` do app; única fonte de verdade declarada no projeto e
  repetida na tag.
- **Release**: publicação de uma versão, com instalador, arquivos de atualização e notas.
- **Notas de versão**: lista de mudanças desde a release anterior, geradas do histórico.
- **Estado da atualização**: situação vista pelo jogador: verificando, sem novidades, baixando,
  pronta para aplicar, falha na verificação.
- **Pasta de dados do usuário**: onde ficam saves e assets extraídos; nunca removida pela
  desinstalação padrão nem pela atualização.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Da criação da tag até o instalador disponível na release pública: menos de 20
  minutos, sem intervenção manual.
- **SC-002**: Num PC Windows limpo, uma pessoa seguindo apenas o README instala e abre o app.
- **SC-003**: Com uma versão mais nova publicada, um app antigo com internet detecta, baixa e,
  ao reiniciar, abre na versão nova, em 100% das tentativas de teste.
- **SC-004**: Com a rede desconectada, o app abre em no máximo 2 segundos a mais que com rede,
  e o aviso discreto aparece em até 15 segundos.
- **SC-005**: Um build com um arquivo de asset injetado de propósito falha na verificação de
  conteúdo em 100% das tentativas, nomeando o arquivo.
- **SC-006**: Uma atualização interrompida (rede cortada no meio do download) deixa a versão
  anterior abrindo normalmente em 100% das tentativas.
- **SC-007**: Após desinstalar com as opções padrão, 100% dos arquivos da pasta de dados do
  usuário continuam presentes.

## Assumptions

- **Fonte de atualização**: as releases públicas do repositório no GitHub. O repositório precisa
  ser público, ou os jogadores não conseguem baixar sem credenciais.
- **Instalação por usuário**: o app instala na pasta do usuário, sem pedir administrador; isso
  também permite que a atualização seja aplicada sem elevação.
- **Sem assinatura de código**: o SmartScreen aparece na primeira instalação e pode aparecer de
  novo em versões novas até o app ganhar reputação; a atualização automática não exige que o
  jogador passe pelo aviso de novo.
- **Versão única**: a versão do app vive num único lugar no projeto; a tag deve repeti-la.
  Incrementar a versão é passo do desenvolvedor antes de criar a tag.
- **Notas de versão**: geradas a partir das mensagens de commit (em inglês, conforme a
  constituição) desde a tag anterior; não há tradução.
- **Pasta de dados do usuário**: a pasta padrão de dados do app no perfil do Windows; specs
  futuros (extrator, saves) gravam lá.
- **Tela de versão**: a janela atual de placeholder já mostra a versão; o aviso de atualização e
  o aviso discreto de offline entram nessa mesma janela.
- **Branch**: esta feature começa a partir do código da `001-project-foundation`.
- **Fora do escopo**: certificado de assinatura de código, Linux e macOS, canais de beta e
  atualização durante partida em andamento.
