# Bloco R: Rede pela internet

Prompts do bloco avulso R (conexão direta entre jogadores pela internet, além da LAN). Escolhas do
desenvolvedor: IPv6 direto e WebRTC P2P, sem servidor próprio (sem relay, sem VPN, sem túnel).

## R.1 Senha da sala

Item R.1 do roadmap (avulso): Senha da sala.
Fazer: o host pode definir uma senha opcional ao abrir a sessão para outros PCs. O `hello` ganha o campo opcional `roomPassword`; o socket de rede recusa (código `wrong-password`) a conexão remota cujo `hello` não traz a senha certa, com comparação em tempo constante e no máximo 5 tentativas erradas por IP por minuto. O jogador local do host nunca precisa da senha.
Pronto quando: testes cobrem senha certa, errada, ausente, sessão sem senha e o limite de tentativas.

Regras do item:
- Muda o protocolo: suba a versão.
- Textos novos passam pela estrutura de i18n.

Verificação: leve (CLAUDE.md).

## R.2 IPv6 direto

Item R.2 do roadmap (avulso): IPv6 direto.
Fazer: o socket de rede escuta em `::` (IPv4 e IPv6 juntos), voltando para `0.0.0.0` se a máquina não tiver IPv6. `parseAddress` aceita `[endereço-v6]:porta` e IPv6 sem porta; a conexão remota põe colchetes no IPv6 ao montar a URL. A tela do host mostra também os IPv6 globais do PC (sem link-local `fe80::/10` e sem ULA `fc00::/7`). Escrever `docs/multiplayer-internet.md` (PT-BR): firewall do Windows, liberação de entrada IPv6 no roteador, qual endereço passar e o uso da senha da sala.
Pronto quando: testes cobrem os formatos de endereço, o filtro dos endereços exibidos e o socket aceitando conexão por `127.0.0.1` e por `::1`.

Regras do item:
- Depende de: R.1.
- Sem dependência nova. O protocolo não muda.

Verificação: leve (CLAUDE.md). Teste real entre duas casas com IPv6 vai para o roteiro manual em `.evidence/R/`.

## R.3 Conexão direta por WebRTC

Item R.3 do roadmap (avulso): Conexão direta por WebRTC.
Fazer: opção "Convidar pela internet" no host e "Entrar com convite" no convidado, sem servidor próprio. O host gera um código de convite (oferta WebRTC com os candidatos ICE já reunidos, comprimida em texto copiável); o convidado cola e gera um código de resposta; o host cola a resposta e a conexão abre por um DataChannel confiável e ordenado. O WebRTC roda no renderer (o Electron já o tem); no host, cada DataChannel chega ao servidor de jogo por `MessagePort`, e o socket de rede passa a aceitar uma interface mínima de conexão (enviar, fechar, mensagem, fechamento) atendida tanto pelo `WebSocket` quanto pelo DataChannel. A senha da sala (R.1) vale também aqui. O servidor STUN fica nas Configurações, com um STUN público como padrão; sem TURN.
Pronto quando: testes, com WebRTC simulado, cobrem a codificação e decodificação dos códigos (incluindo código corrompido ou de outra versão), o tempo limite de um convite, o fechamento por qualquer lado e a interface mínima de conexão; o harness continua passando pela LAN.

Regras do item:
- Depende de: R.1.
- Test-first na codificação dos códigos e no ciclo de vida do convite.
- O protocolo do jogo não muda; o formato do código de convite tem versão própria.
- Sem dependência nova. Se a ponte renderer → servidor se mostrar inviável, pare e pergunte antes de adicionar `node-datachannel`.
- Textos novos passam pela estrutura de i18n.

Verificação: leve (CLAUDE.md). Conexão real (e o que acontece com NAT simétrico) vai para o roteiro manual em `.evidence/R/`.

## R.4 Verificação

Item R.4 do roadmap (avulso): Verificação do bloco R.
Fazer: verificação completa (CLAUDE.md) e o roteiro manual em `.evidence/R/`: dois PCs em redes diferentes por IPv6 direto e por convite WebRTC, com a senha da sala, anotando latência percebida e o que acontece quando a conexão cai.
Pronto quando: as verificações automáticas passam e o roteiro está escrito.

Verificação: completa (CLAUDE.md).
