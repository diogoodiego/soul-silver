# Jogar pela internet

Além da LAN, há quatro jeitos de jogar com amigos de fora da sua rede. Tente nesta ordem:

1. **Salas online** (recomendado): o anfitrião cria uma sala e passa um código, ou deixa a sala na
   lista pública. Funciona na maioria das redes, inclusive 4G e internet com CGNAT.
2. **Por IPv6**: conexão direta pelo endereço IPv6 do anfitrião, sem servidor no meio.
3. **Convite por código** (copiar e colar): a alternativa às salas que não usa o servidor de salas.
4. **VPN de rede local** (ZeroTier ou Tailscale): último recurso, quando nada acima conecta.

## Antes de tudo: defina uma senha

Pela internet, qualquer pessoa que descobrir o código da sala ou o seu endereço pode tentar entrar. Em
**Configurações → Senha da sala**, escolha uma senha e passe só para os amigos. Ela vale a partir da
próxima vez que você abrir a partida para a rede. Depois de 5 senhas erradas em 1 minuto, quem errou
fica bloqueado até o minuto passar. Salas com senha aparecem na lista com a marca "com senha".

## Salas online

O servidor de salas só apresenta os jogadores: ele guarda o código e o nome da sala e repassa as
mensagens de conexão. A partida em si vai direto de PC para PC; quando a rede não deixa (4G, CGNAT),
ela passa por um relay (TURN) da Cloudflare, sem que você precise configurar nada.

### Anfitrião

1. Comece a partida como anfitrião (Jogar → Hospedar) ou, numa partida sozinho, abra a aba **Online**
   e clique em **Criar sessão na rede**.
2. Na aba **Online**, em **Sala online**, dê um nome à sala (opcional), escolha se ela aparece na lista
   de salas e clique em **Criar sala online**.
3. Aparece o **código da sala**, como `K7P-2QX`. Clique em **Copiar** e mande para os amigos, junto com
   a senha. Se a sala estiver na lista, eles também podem escolhê-la por lá.
4. A aba mostra quem está conectando e quem conectou. Até 3 amigos podem entrar.
5. **Fechar sala** tira a sala do servidor; quem já está jogando continua. A sala também fecha sozinha
   quando você sai da partida ou fecha o jogo.

Se o servidor de salas cair, a aba mostra "Reconectando…" e quem já está jogando continua. Se ele
ficar fora por mais de 45 segundos, a sala volta com um código novo, que aparece na aba.

### Convidado

1. Vá em Jogar → escolha o save → **Entrar**.
2. Se a sala tiver senha, digite em **Senha da sala**.
3. Em **Salas online**, clique na sala da lista (ela atualiza a cada 10 segundos) ou digite o código em
   **Entrar com código** (maiúsculas, minúsculas e o traço tanto faz) e clique em **Entrar**.
4. Se a conexão cair durante a partida, clique em **Reconectar**: o jogo entra de novo pela mesma sala,
   sozinho, por até 2 minutos, e você volta com o progresso que o anfitrião salvou.

### Se não conectar

| Mensagem | O que fazer |
|---|---|
| "Não foi possível falar com o servidor de salas" | Confira a internet. Se mudou Configurações → Servidor de salas, apague o campo para voltar ao padrão. |
| "Não existe sala com esse código" | Confira o código; a sala pode ter fechado. |
| "A sala usa outra versão do jogo" | Os dois precisam da mesma versão: feche e abra o jogo para ele se atualizar. |
| "A sala está cheia" | Já há 4 jogadores. |
| "Senha da sala incorreta" | Confira maiúsculas e minúsculas. |
| "O servidor de salas não conseguiu o relay (TURN) agora" (no anfitrião) | Quem está em 4G pode não entrar. Feche a sala e crie de novo em alguns minutos. |
| "Não deu para conectar ao anfitrião" | Tente de novo. Se continuar, use a VPN de rede local (último item desta página). |

## Por IPv6

Conexão direta: o PC do convidado conecta direto no PC do anfitrião, sem servidor no meio.

### Requisitos

- **Os dois PCs precisam ter IPv6.** Para conferir, abra <https://test-ipv6.com> nos dois.
  Muitas operadoras brasileiras já entregam IPv6; em 4G e em algumas redes de condomínio pode não haver.
- **O roteador do anfitrião precisa deixar entrar conexões IPv6.** Muitos roteadores de operadora
  bloqueiam por padrão (procure por "firewall IPv6", "IPv6 inbound" ou "filtro IPv6" no painel do
  roteador). Libere a porta do jogo, **47800/TCP** (ou a que aparece no jogo), para o PC do anfitrião.
- **Firewall do Windows do anfitrião:** ao hospedar pela primeira vez, o Windows pergunta se o jogo
  pode se comunicar. Marque **Redes privadas** e confira que a rede de casa está como "Privada" em
  Configurações do Windows → Rede e Internet (o perfil é o da sua rede, não o de quem conecta).

### Passo a passo

1. O anfitrião abre a partida para a rede (Jogar → Hospedar, ou o botão no painel Online).
2. O jogo mostra os endereços do PC. Os de IPv6 aparecem entre colchetes, por exemplo
   `[2804:14c:65:1::10]`. Passe esse endereço (e a senha) para o amigo.
   Pode aparecer mais de um IPv6: o Windows cria endereços temporários. Qualquer um serve enquanto
   estiver na lista; se a conexão falhar mais tarde, confira a lista de novo.
3. O convidado vai em Jogar → Entrar, digita o endereço em "IP do anfitrião" e a senha em
   "Senha da sala", e conecta.

Formatos aceitos: `2804:14c:65:1::10`, `[2804:14c:65:1::10]` e `[2804:14c:65:1::10]:47801`.

### Se não conectar

| Sintoma | Causa provável |
|---|---|
| "ninguém está hospedando nesse endereço" | Firewall do Windows do anfitrião bloqueou; ou o jogo não está hospedando. |
| Demora e falha sem mensagem clara | O roteador do anfitrião bloqueia a entrada IPv6; ou o convidado não tem IPv6. |
| "Senha da sala incorreta" | Senha errada; confira maiúsculas e minúsculas. |
| "Muitas tentativas com senha errada" | Espere um minuto e tente de novo com a senha certa. |

## Convite por código

Na aba **Online** do anfitrião, **Convidar pela internet** gera um código de convite. O amigo cola o
código em Jogar → Entrar → **Por convite**, o jogo gera uma resposta, ele manda de volta e o anfitrião
cola. Um convite por amigo. Não usa o servidor de salas, mas não reconecta sozinho se a conexão cair
(é preciso um convite novo) e não usa o relay (TURN), então costuma falhar em 4G.

## Último recurso: VPN de rede local

Uma VPN de rede local faz os PCs se enxergarem como se estivessem na mesma casa. Aí o jogo funciona
como na LAN. Use se nada acima conectar. As duas opções abaixo são gratuitas para uso pessoal.

### Tailscale

1. Os dois (anfitrião e convidado) instalam o Tailscale (<https://tailscale.com/download>) e entram com
   uma conta (Google, Microsoft ou GitHub).
2. O anfitrião convida o amigo para a rede dele: no painel <https://login.tailscale.com/admin/users>,
   **Invite users**, ou compartilha a máquina dele (**Machines → ⋯ → Share**).
3. Com os dois conectados (ícone do Tailscale ativo), o anfitrião vê o endereço dele no Tailscale
   (começa com `100.`) no ícone da bandeja.
4. O anfitrião hospeda a partida normalmente. O convidado vai em Jogar → Entrar → **Por endereço** e
   digita esse endereço `100.x.y.z`.

### ZeroTier

1. O anfitrião cria uma conta em <https://my.zerotier.com>, clica em **Create A Network** e anota o
   **Network ID** (16 caracteres).
2. Os dois instalam o ZeroTier (<https://www.zerotier.com/download/>), clicam no ícone da bandeja →
   **Join New Network** e colam o Network ID.
3. O anfitrião volta ao site, abre a rede e marca **Auth** nos dois dispositivos que apareceram em
   **Members**. Lá também aparece o endereço de cada um (coluna **Managed IPs**).
4. O anfitrião hospeda a partida. O convidado entra por **Por endereço** com o endereço do anfitrião
   mostrado em **Managed IPs**.

Nos dois casos, o Firewall do Windows do anfitrião pode perguntar de novo se o jogo pode se comunicar:
marque **Redes privadas** e, se a rede da VPN aparecer como "Pública", mude para "Privada" em
Configurações do Windows → Rede e Internet.
