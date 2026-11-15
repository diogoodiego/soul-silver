<!--
Sync Impact Report
- Versão: 1.4.0 → 1.5.0 (MINOR): o Fluxo de Desenvolvimento troca o Spec Kit pelos itens do
  roadmap, com estado em `docs/STATUS.md` e regras em `CLAUDE.md`; typecheck, lint e suíte
  inteira passam a ser exigidos no item de verificação de cada bloco. Templates do Spec Kit ficam
  como histórico e não são mais atualizados.
- Versão: 1.3.0 → 1.4.0 (MINOR: orientação materialmente expandida)
- Princípio modificado: V (Test-first na lógica) — "Camadas de verificação" ganha a ordem de
  escolha: servidor sem interface sempre que possível; app só para o que o servidor não
  verifica, com o slot 3 como save de teste.
- Versão anterior não commitada: 1.2.0 → 1.3.0 criou "Camadas de verificação", com seção "Como
  testar" obrigatória, tarefas por camada e critérios de conclusão, absorveu "Verificação com
  dados reais" e passou a verificação de render e UI de "manual" para camada 4 ou 5.
- Seções adicionadas: nenhuma. Seções removidas: nenhuma.
- Compatibilidade: o Princípio II segue valendo; a camada 3 é local, nunca na CI.
- Templates atualizados na 1.3.0: spec-template.md e tasks-template.md. Na 1.4.0 eles não mudam:
  a regra escolhe a camada, e o formato da seção "Como testar" continua o mesmo.
- Follow-up: o script `npm run golden` ainda não existe (tarefa T047 do spec 024).
- Follow-up: `.claude/skills/speckit-specify` veta ferramentas no spec e
  `.claude/skills/speckit-tasks` trata testes como opcionais. Os templates registram a exceção;
  as skills não foram alteradas.
-->
# SoulSilver Desktop Constitution

## Visão

SoulSilver Desktop é um remake de Pokémon SoulSilver (Johto, Kanto e pós-jogo) como app
desktop para Windows, feito em Electron, com multiplayer LAN. O jogo mantém o mesmo mapa, os
mesmos modelos e sprites e os mesmos triggers da história do original.

Mudanças intencionais de mecânica:

- Combate action em tempo real, em que o jogador controla o Pokémon diretamente.
- Pokémon selvagens visíveis no mapa, sem encontros aleatórios.
- Multiplayer LAN de 2 a 4 jogadores, com progresso individual em mundo compartilhado.

Os mapas são desenhados em 3D a partir dos modelos extraídos da ROM, numa câmera fixa como a do
DS, com grade de colisão 2D. O app de qualquer jogador pode
hospedar uma partida, e jogar sozinho é uma partida de 1 jogador.

## Princípios Fundamentais

### I. Conteúdo fiel, mecânica livre

- Mapa, modelos, sprites, textos, eventos da história, stats, golpes, tabelas de encontro e
  times de treinadores MUST vir dos dados extraídos da ROM.
- Os dados originais MUST ser a base do balanceamento.
- Todo desvio de balanceamento MUST ser registrado em `docs/balance-log.md`, com valor
  original, valor novo e motivo.

**Motivo**: a identidade do remake é o conteúdo original; a mecânica nova muda como se joga,
não o que existe no mundo. O log torna cada ajuste rastreável e reversível.

### II. Assets nunca distribuídos

- O repositório, os builds e o instalador MUST conter apenas código. Assets, a ROM e dados
  derivados da ROM MUST NOT ser commitados nem empacotados.
- O extrator é uma biblioteca usada de duas formas: pelo app, que na primeira execução pede a
  ROM do usuário, e por uma CLI de desenvolvimento.
- O extrator MUST aceitar apenas Pokémon SoulSilver (EUA), conferido por hash, e MUST recusar
  qualquer outro arquivo com mensagem clara.
- O extrator MUST gravar os assets na pasta de dados do usuário.
- Um hook de pre-commit MUST bloquear arquivos de asset.
- Os testes MUST usar fixtures sintéticos e MUST NOT depender de dados reais da ROM.

**Motivo**: o projeto só é distribuível se nada protegido por direitos autorais sair junto
dele. Cada jogador fornece a própria cópia do jogo.

### III. Conteúdo data-driven

- Golpes, arquétipos de golpe, spawns, treinadores, scripts de evento, mapas e textos MUST
  viver em arquivos de dados, gerados pelo extrator ou escritos à mão, e MUST NOT ficar fixos
  no código.
- Todo arquivo de dados MUST ter schema validado no carregamento, com erro claro (arquivo,
  caminho do campo e problema) quando inválido.

**Motivo**: separar dados de lógica permite rebalancear, corrigir e estender conteúdo sem
mexer em código, e o schema falha cedo em vez de corromper a partida.

### IV. Servidor autoritativo e simulação isolada

- O servidor de jogo MUST ser a única fonte de verdade e MUST simular em tick fixo de 20 Hz.
- O servidor MUST rodar num processo ou thread próprio no app do host, separado do renderer e
  da gestão de janelas, para que a interface nunca atrase o tick.
- O cliente envia inputs e desenha o estado; ele MUST NOT decidir dano, captura, spawn ou
  progresso.
- A simulação MUST ser independente de render, rede e Electron, e MUST ser testável em Node
  puro.
- Jogar sozinho MUST usar o mesmo servidor local: existe um único caminho de código.

**Motivo**: um único caminho autoritativo elimina divergências entre solo e multiplayer e
mantém a lógica testável sem a pilha gráfica.

### V. Test-first na lógica (NÃO NEGOCIÁVEL)

- Combate, interpretador de scripts, spawns e IA de selvagens, captura, servidor, protocolo de
  rede, descoberta na LAN, extrator e migrações de save MUST seguir red-green-refactor: o teste
  é escrito e falha antes da implementação.
- Render (three.js) e UI (Svelte) ficam isentos de test-first, mas cada mudança visível MUST ser
  verificada na camada 4 ou, se nenhuma camada a automatiza, na camada 5, antes de ser concluída.
- **Camadas de verificação**: todo spec MUST ter uma seção "Como testar" que lista os casos de
  teste por camada, com o comando que roda cada um. O `tasks.md` MUST ter tarefas para cada
  camada listada. Uma camada que não se aplica MUST constar como "Não se aplica", com o motivo.
  As camadas são:
  1. **Unidade**: vitest com fixtures sintéticos. Roda na integração contínua.
  2. **Servidor sem interface**: o harness com clientes falsos em memória
     (`packages/server/test/harness.ts`), incluindo cenários com 2 a 4 jogadores. Roda na
     integração contínua.
  3. **ROM real**: o caminho dourado e sondas locais que usam a extração real (`npm run golden`
     e equivalentes). Rodam só localmente, nunca na integração contínua (Princípio II).
  4. **App**: roteiro executado pelo driver da skill `run-soulsilver`, com capturas de tela
     nomeadas e leitura do overlay F3.
  5. **Manual**: só para o que nenhuma camada automatiza (sensação dos controles, som,
     legibilidade), com roteiro escrito.
- As verificações MUST ser feitas pelo servidor sem interface sempre que possível (camadas 2 e
  3). Só o que o servidor não consegue verificar vai para o app (camada 4). No app, o agente
  pode abrir o app e MUST usar o save do slot 3 como save de teste.
- Testes de unidade e da integração contínua MUST continuar usando apenas fixtures sintéticos
  (Princípio II). Todo spec que entrega conteúdo jogável ou depende de dados extraídos MUST
  listar a camada 3.
- Um spec só é concluído quando, além das tarefas, as camadas 1 e 2 passam na integração
  contínua, a camada 3 listada passa localmente com o relatório anexado ao `tasks.md` e as
  capturas da camada 4 listada estão salvas em `.evidence/<número-do-spec>/`.
- A pasta `.evidence/` MUST estar no `.gitignore`, porque as capturas contêm arte do jogo
  (Princípio II).
- Critérios de sucesso que dizem "funciona no jogo" MUST ser verificados pelas camadas 3 ou 4, e
  MUST NOT ser dados como atendidos apenas por testes sintéticos.

**Motivo**: a lógica do jogo é desenvolvida em grande parte por agentes de IA; testes escritos
primeiro são a especificação executável que impede regressões silenciosas. Fixtures sintéticos
não provam que o conteúdo real funciona; as camadas 3 e 4 fecham essa lacuna sem distribuir nem
depender de assets na CI, e a camada 5 cobre apenas o que exige um jogador humano.

### VI. Contratos versionados

- Tipos, mensagens de rede, API de IPC do Electron e schemas de dados MUST viver no pacote
  compartilhado (`shared`).
- O protocolo de rede MUST ter versão, e apps de versões diferentes MUST recusar a conexão com
  mensagem clara.
- Saves MUST ter `schemaVersion`, e toda mudança de formato MUST vir com migração testada.

**Motivo**: contratos num só lugar evitam que app, cliente e servidor divirjam; versões
explícitas transformam incompatibilidades em erros claros em vez de bugs.

### VII. Progresso individual em mundo compartilhado

- Flags, insígnias, equipe e eventos MUST ser por jogador.
- O servidor MUST enviar a cada cliente apenas NPCs, treinadores e eventos coerentes com as
  flags daquele jogador.
- Pokémon selvagens MUST ser compartilhados entre os jogadores.
- Cutscenes MUST rodar no cliente de quem as disparou; os outros jogadores veem esse jogador
  como "ocupado".

**Motivo**: cada jogador vive a própria história sem bloquear os outros, e o mundo continua
sendo um só.

### VIII. Saves do jogador, no PC do jogador

- Cada jogador MUST guardar o próprio save em arquivo na pasta de dados do app, no próprio PC.
- Ao entrar numa partida, o save é enviado ao host, que MUST validá-lo antes de aceitá-lo.
- Durante a partida, o host devolve o estado atualizado e o cliente grava.
- A gravação MUST ser atômica e MUST manter pelo menos um backup do save anterior.

**Motivo**: o progresso pertence ao jogador e acompanha ele entre partidas de hosts
diferentes; gravação atômica com backup evita perda por queda ou crash.

### IX. Segurança do Electron

- O renderer MUST rodar com `contextIsolation` ativo, `nodeIntegration` desativado e
  `sandbox` ativo.
- O acesso a arquivos, rede e sistema MUST passar apenas por uma API de IPC tipada, exposta
  pelo preload.
- O renderer MUST NOT carregar conteúdo remoto.

**Motivo**: o app troca dados com outros PCs da rede; isolar o renderer limita o impacto de
qualquer mensagem ou save malformado.

### X. Desempenho e simplicidade

- Meta: 60 fps num PC Windows modesto com GPU integrada e 4 jogadores conectados, sem estourar
  o orçamento do tick de 20 Hz (50 ms). Features MUST NOT regredir essa meta.
- YAGNI: cada dependência nova MUST ser justificada no plano da feature.
- A solução mais simples que atende a spec SHOULD ser preferida; complexidade extra MUST ser
  justificada no plano.

**Motivo**: o público joga em PCs comuns numa LAN entre amigos; simplicidade mantém o projeto
viável para um desenvolvedor solo.

### XI. Entrega incremental jogável

- O desenvolvimento acontece em marcos, e cada marco MUST ser jogável de ponta a ponta.
- Ordem dos marcos: extrator → núcleo (movimento, colisão, combate, captura, LAN) → Johto até
  a Liga → Kanto → pós-jogo.

**Motivo**: marcos jogáveis validam a mecânica cedo e garantem que o projeto tenha valor em
qualquer ponto em que pare.

## Restrições Técnicas

- **Plataforma**: apenas Windows 10 e 11, 64 bits. Linux e macOS estão fora do escopo.
- **Runtime**: Electron, com o servidor de jogo em Node.js rodando em processo ou thread
  separado no app do host.
- **Linguagem**: TypeScript em modo strict em todo o código (MUST).
- **Renderer**: three.js (WebGL) para o jogo e Svelte para a interface (menus, mochila, Pokédex,
  diálogos, HUD).
- **Rede**: WebSocket entre os apps, de 2 a 4 jogadores por partida. As partidas MUST ser
  anunciadas na LAN automaticamente (broadcast UDP ou mDNS), com conexão manual por IP como
  alternativa.
- **Monorepo** com os pacotes:
  - `app` — processo principal e preload do Electron;
  - `client` — renderer;
  - `server` — servidor de jogo e simulação;
  - `shared` — tipos, protocolo, IPC e schemas;
  - `extractor` — extrator de assets da ROM (biblioteca + CLI).
- **Distribuição**: GitHub Releases, com instalador para Windows e auto-update, para manter
  todos os jogadores na mesma versão.
- **Controles**: teclado + mouse (mouse para mirar) e gamepad, via Gamepad API.
- **Idioma do jogo**: textos em inglês, como extraídos da ROM, com i18n estruturada desde o
  início para tradução futura.
- **Idioma do projeto**: specs, planos e documentação MUST ser em PT-BR. Código,
  identificadores, commits e comentários MUST ser em inglês.

## Modelo de Confiança

- O jogo é feito para LAN entre amigos.
- O servidor MUST validar a forma e a coerência das mensagens e dos saves.
- O projeto não implementa anti-cheat e não oferece multiplayer pela internet.
- Jogar via VPN de LAN virtual funciona pela conexão manual por IP, sem suporte oficial.

## Fluxo de Desenvolvimento

- Desenvolvimento solo com agentes de IA. Toda feature MUST seguir um item do roadmap, com o
  estado registrado em `docs/STATUS.md` e as regras de execução em `CLAUDE.md`. O Spec Kit não é
  mais usado: onde esta constituição fala em spec, leia bloco do roadmap; onde fala em
  `tasks.md`, leia `docs/STATUS.md` e o relatório entregue ao fim do item.
- Um item MUST NOT ser marcado como concluído sem os testes do que ele mudou passando. Um bloco
  MUST NOT ser concluído sem typecheck, lint e a suíte inteira passando no seu item de verificação.
- Código gerado por agentes MUST seguir as mesmas regras e MUST ser revisado pelo desenvolvedor
  antes do merge.
- Todo plano de item MUST respeitar cada princípio, ou justificar explicitamente o desvio.

## Governança

- Esta constituição prevalece sobre qualquer outra prática do projeto.
- Emendas MUST incluir: descrição da mudança, motivo, atualização dos templates afetados e
  incremento de versão semântica:
  - **MAJOR**: remover ou redefinir princípio;
  - **MINOR**: adicionar princípio ou seção, ou expandir materialmente uma orientação;
  - **PATCH**: esclarecimento, redação ou correção sem mudança de significado.
- Conformidade: todo plano MUST passar pelo "Constitution Check", e toda revisão antes do merge
  MUST verificar a conformidade com esta constituição. Desvios MUST ser justificados no plano
  da feature.

**Version**: 1.5.0 | **Ratified**: 2026-10-23 | **Last Amended**: 2026-11-15
