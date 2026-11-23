# Bloco O: Online com salas

Prompts do bloco avulso O: um servidor de salas próprio, pequeno, na Cloudflare (Worker com Durable
Objects), que troca as mensagens de conexão do WebRTC no lugar dos códigos de convite copiados à mão,
mostra uma lista de salas públicas e entrega credenciais do TURN da Cloudflare para quem está em 4G ou
atrás de CGNAT. O jogo continua rodando no app do anfitrião (R.3); o servidor de salas não guarda nem
repassa nenhum dado do jogo, só dados da sala e mensagens de conexão.

Escolhas do desenvolvedor (2026-11-22): salas por código e lista pública (1b); TURN desde já (2a);
teste final com um amigo em 4G. Muda a decisão do bloco R "sem relay": o TURN da Cloudflare entra
como fallback, e o STUN padrão passa a ser o da Cloudflare.

Contas e secrets (feitos pelo desenvolvedor): conta na Cloudflare com subdomínio `workers.dev`;
secrets do GitHub `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_TURN_KEY_ID` e
`CLOUDFLARE_TURN_KEY_API_TOKEN` (os dois do TURN podem chegar depois: até lá o servidor entrega só STUN); o subdomínio está anotado em "Decisões" do `docs/STATUS.md`.

### O.1 Servidor de salas

Item O.1 do roadmap (avulso): Servidor de salas.
Fazer: novo pacote `packages/lobby` (Cloudflare Worker em TypeScript strict) com um Durable Object por sala e um Durable Object de diretório para a lista pública, ambos com armazenamento SQLite (o único disponível no plano gratuito) e WebSockets com hibernação. API sobre WebSocket, com mensagens validadas por zod e versão própria (`lobbyProtocol: 1`):
- Anfitrião: `create` (nome da sala, nome do anfitrião, versão do app, versão do protocolo do jogo, máximo de jogadores, se é pública, se tem senha) → recebe o código da sala (6 caracteres de um alfabeto sem 0/O/1/I/L) e um token de anfitrião; `update` (jogadores atuais); `close`; e um heartbeat a cada 15 s. Sem heartbeat por 45 s, a sala some.
- Convidado: `join` (código) → recebe os dados da sala e um token de convidado; depois as mensagens `signal` (oferta, resposta e candidatos ICE do WebRTC) são repassadas entre aquele convidado e o anfitrião, sem o servidor interpretá-las.
- Lista: `GET /rooms?protocol=<n>` devolve as salas públicas com a mesma versão de protocolo (código, nome, anfitrião, jogadores/máximo, se tem senha), no máximo 50.
- Limites: no máximo 3 salas criadas por IP a cada 10 min, 20 mensagens `signal` por segundo por conexão, mensagens de até 16 KB, sala sem convidados por 1 h é encerrada. Nada fica salvo depois que a sala fecha.
Pronto quando: testes com `@cloudflare/vitest-plugin` (novo nome do `@cloudflare/vitest-pool-workers`) cobrem criar, entrar, repassar sinal nos dois sentidos com 2 convidados, código inexistente, sala cheia, versão de protocolo diferente na lista, expiração por falta de heartbeat, limites e mensagens malformadas; `npx wrangler dev` sobe o servidor localmente.

Regras do item:
- Dependências novas permitidas neste item, só no pacote `lobby`: `wrangler`, `@cloudflare/workers-types`, `@cloudflare/vitest-plugin` (novo nome do `@cloudflare/vitest-pool-workers`). Qualquer outra: pare e pergunte.
- Os tipos e schemas das mensagens ficam em `packages/shared/src/lobby/` para o app usar os mesmos.
- O servidor nunca recebe dados do jogo nem da ROM; os testes da CI não sobem a Cloudflare de verdade.

Verificação: leve (CLAUDE.md), mais os testes do pacote `lobby`.

### O.2 Publicação do servidor de salas

Item O.2 do roadmap (avulso): Publicação do servidor de salas.
Fazer: workflow `.github/workflows/lobby.yml` que, em push no `main` com mudança em `packages/lobby/**` ou `packages/shared/src/lobby/**` (e por `workflow_dispatch`), roda os testes do pacote e publica com `cloudflare/wrangler-action`, usando os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`, e grava `CLOUDFLARE_TURN_KEY_ID` e `CLOUDFLARE_TURN_KEY_API_TOKEN` como secrets do Worker (`wrangler secret put`); se esses dois secrets ainda não existirem no GitHub, o passo é pulado com aviso, sem falhar o workflow. O nome do Worker é `soulsilver-lobby`. O endereço público (`https://soulsilver-lobby.diogo-soul-silver.workers.dev`) vira o padrão do app em `packages/shared/src/lobby/defaults.ts`. Acrescente ao README uma seção "Servidor de salas" com o que ele guarda, como publicar e como ver os logs (`wrangler tail`).
Pronto quando: o workflow está escrito e validado (sintaxe e passos); o endereço padrão está no código; o README explica o servidor. A primeira publicação real é feita pelo desenvolvedor ao dar push.

Regras do item:
- Depende de: O.1.
- Nunca coloque token, ID de conta ou chave TURN em arquivo versionado; só nos secrets.
- Se o subdomínio não estiver no STATUS, pare e pergunte.

Verificação: leve (CLAUDE.md).

### O.3 Credenciais TURN

Item O.3 do roadmap (avulso): Credenciais TURN.
Fazer: o servidor de salas entrega, junto com a resposta do `create` e do `join`, a lista de servidores ICE para aquela conexão: STUN `stun:stun.cloudflare.com:3478` e credenciais TURN de curta duração geradas pela API da Cloudflare (`/v1/turn/keys/<id>/credentials/generate-ice-servers`, TTL de 2 h, `customIdentifier` com o código da sala) a partir dos secrets do Worker. Se os secrets do TURN não estiverem configurados no Worker, entrega só o STUN, sem chamar a API. A chave TURN nunca sai do servidor. Se a API da Cloudflare falhar, a sala funciona só com STUN e o app recebe um aviso.
Pronto quando: testes com a API da Cloudflare simulada cobrem credencial gerada, falha da API (só STUN), secrets ausentes (só STUN), TTL e que a chave não aparece em nenhuma resposta.

Regras do item:
- Depende de: O.1.
- No máximo 1 pedido de credencial por conexão de sala; nada de endpoint público que gere credencial sem sala.

Verificação: leve (CLAUDE.md), mais os testes do pacote `lobby`.

### O.4 Hospedar sala online no app

Item O.4 do roadmap (avulso): Hospedar sala online no app.
Fazer: no painel Online do host, a opção "Criar sala online" (nome da sala, pública ou só por código; a senha continua sendo a das Configurações, R.1). O app conecta ao servidor de salas pelo renderer, mostra o código da sala com botão de copiar, mantém o heartbeat, atualiza o número de jogadores e fecha a sala ao encerrar a sessão ou fechar o app. Para cada convidado que entra, o host cria um `RTCPeerConnection` próprio com os servidores ICE recebidos, troca oferta, resposta e candidatos pelas mensagens `signal` (ICE incremental, sem esperar reunir todos) e entrega o DataChannel ao servidor de jogo pelo mesmo caminho do R.3 (`MessagePort` → `ws-listener`). Até 3 convidados ao mesmo tempo. O endereço do servidor de salas e o STUN ficam nas Configurações (padrão do O.2; o STUN padrão passa a ser o da Cloudflare). Os convites por código copiado do R.3 continuam disponíveis como alternativa.
Pronto quando: testes com servidor de salas falso e WebRTC simulado cobrem criar sala, dois convidados conectando ao mesmo tempo, convidado saindo, host fechando (a sala some), servidor de salas fora do ar (mensagem clara, LAN segue funcionando) e reconexão do host ao servidor de salas sem derrubar quem já está jogando.

Regras do item:
- Depende de: O.1 e O.3.
- O protocolo do jogo não muda; se mudar, suba a versão. Textos novos pela i18n; tipografia e cores pelas regras do CLAUDE.md.
- Sem dependência nova.

Verificação: leve (CLAUDE.md).

### O.5 Entrar por código e lista de salas

Item O.5 do roadmap (avulso): Entrar por código e lista de salas.
Fazer: na tela de entrar em partida (onde fica a lista da LAN), uma seção "Salas online" com a lista pública (nome, anfitrião, jogadores/máximo, cadeado quando tem senha; atualiza a cada 10 s e ao abrir) e um campo "Entrar com código". Ao entrar, o app faz `join`, pede a senha se a sala tiver, troca os sinais com o host e conecta pelo DataChannel. Salas de outra versão do jogo não aparecem; código de outra versão mostra "a sala usa outra versão do jogo, atualize o app". Mensagens claras para código inexistente, sala cheia, senha errada e falha de conexão (sugerindo o guia de VPN como último recurso).
Pronto quando: testes com servidor de salas falso cobrem a lista filtrada por versão, entrar por código, entrar pela lista, senha certa e errada, sala cheia, sala que sumiu entre listar e entrar, e falha de conexão com mensagem.

Regras do item:
- Depende de: O.4.
- Textos novos pela i18n; tipografia e cores pelas regras do CLAUDE.md.
- Sem dependência nova.

Verificação: leve (CLAUDE.md).

### O.6 Reconexão pela sala

Item O.6 do roadmap (avulso): Reconexão pela sala.
Fazer: o convidado que entrou por sala guarda o código e, se a conexão cair, o botão "Reconectar" refaz o `join` e a troca de sinais sozinho (sem convite novo), por até 2 minutos; o host aceita o mesmo jogador de volta pela regra que a LAN já usa. O painel Online mostra "sala K7P-2QX" como endereço, e não "convite". Acaba a pendência do R.3 "convidado por convite não reconecta" para quem entra por sala.
Pronto quando: testes cobrem queda do DataChannel com reconexão bem-sucedida, sala que fechou durante a queda (mensagem clara) e o progresso do convidado preservado.

Regras do item:
- Depende de: O.5.
- Sem dependência nova.

Verificação: leve (CLAUDE.md).

### O.7 Verificação do bloco O

Item O.7 do roadmap (avulso): Verificação do bloco O.
Fazer: verificação completa do bloco e roteiro de teste para o desenvolvedor em `.evidence/O/roteiro.md`: publicar o servidor (push no `main` e conferir o workflow `lobby.yml`), criar sala pública no PC dele, o amigo entrar pela lista usando o 4G do celular como internet do PC (roteamento do celular), jogar 15 minutos (andar junto, troca, duelo), derrubar a internet do amigo por 30 s e reconectar, e conferir no painel da Cloudflare (Realtime → TURN) que houve tráfego pelo TURN. Inclua no roteiro o que anotar se falhar (mensagem na tela, horário, saída de `wrangler tail`). Atualize `docs/multiplayer-internet.md` com o jeito novo de jogar online e um guia curto de VPN de LAN virtual (ZeroTier ou Tailscale) como último recurso.
Pronto quando: typecheck, lint e suíte inteira passam, os testes do pacote `lobby` passam, o roteiro está escrito e o guia atualizado.

Regras do item:
- Corrija só o que a verificação revelar, sem acrescentar recursos.
- Não abra o app; o teste com o amigo é do desenvolvedor.

Verificação: completa (CLAUDE.md), mais os testes do pacote `lobby`.
