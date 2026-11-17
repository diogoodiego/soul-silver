# Jogar pela internet

Além da LAN, o SoulSilver Desktop aceita conexão direta pela internet por **IPv6**. Não há servidor
no meio: o PC do convidado conecta direto no PC do anfitrião.

## Antes de tudo: defina uma senha

Pela internet, qualquer pessoa que descobrir seu endereço pode tentar entrar. Em **Configurações →
Senha da sala**, escolha uma senha e passe só para os amigos. Ela vale a partir da próxima vez que
você abrir a partida para a rede. Depois de 5 senhas erradas em 1 minuto, o endereço que errou fica
bloqueado até o minuto passar.

## Requisitos

- **Os dois PCs precisam ter IPv6.** Para conferir, abra <https://test-ipv6.com> nos dois.
  Muitas operadoras brasileiras já entregam IPv6; em 4G e em algumas redes de condomínio pode não haver.
- **O roteador do anfitrião precisa deixar entrar conexões IPv6.** Muitos roteadores de operadora
  bloqueiam por padrão (procure por "firewall IPv6", "IPv6 inbound" ou "filtro IPv6" no painel do
  roteador). Libere a porta do jogo, **47800/TCP** (ou a que aparece no jogo), para o PC do anfitrião.
- **Firewall do Windows do anfitrião:** ao hospedar pela primeira vez, o Windows pergunta se o jogo
  pode se comunicar. Marque **Redes privadas** e confira que a rede de casa está como "Privada" em
  Configurações do Windows → Rede e Internet (o perfil é o da sua rede, não o de quem conecta).

## Passo a passo

1. O anfitrião abre a partida para a rede (Jogar → Hospedar, ou o botão no painel Online).
2. O jogo mostra os endereços do PC. Os de IPv6 aparecem entre colchetes, por exemplo
   `[2804:14c:65:1::10]`. Passe esse endereço (e a senha) para o amigo.
   Pode aparecer mais de um IPv6: o Windows cria endereços temporários. Qualquer um serve enquanto
   estiver na lista; se a conexão falhar mais tarde, confira a lista de novo.
3. O convidado vai em Jogar → Entrar, digita o endereço em "IP do anfitrião" e a senha em
   "Senha da sala", e conecta.

Formatos aceitos: `2804:14c:65:1::10`, `[2804:14c:65:1::10]` e `[2804:14c:65:1::10]:47801`.

## Se não conectar

| Sintoma | Causa provável |
|---|---|
| "ninguém está hospedando nesse endereço" | Firewall do Windows do anfitrião bloqueou; ou o jogo não está hospedando. |
| Demora e falha sem mensagem clara | O roteador do anfitrião bloqueia a entrada IPv6; ou o convidado não tem IPv6. |
| "Senha da sala incorreta" | Senha errada; confira maiúsculas e minúsculas. |
| "Muitas tentativas com senha errada" | Espere um minuto e tente de novo com a senha certa. |
