# Quickstart: validar o spec 017

Pré-requisitos: ROM válida extraída (incluindo o novo estágio `title`), um gamepad Xbox, e para a
parte multijogador um segundo PC ou uma segunda instância na LAN.

## Testes automáticos

```powershell
pnpm test   # bindings (troca/reservadas), focus, mensagens v9, use-item, reorder-party, settings defaults
```

## Roteiro manual (skill run-soulsilver)

1. **Título (SC-001)**: abrir o app → tela de título com arte, versão e "pressione qualquer botão". Contar: botão → Jogar → save → Sozinho = mapa em 4 escolhas.
2. **Só gamepad (SC-002)**: desconectar o mouse e não tocar no teclado; percorrer título, menu, Configurações, Controles, Sobre, Jogar (todos os passos), menu do jogo, equipe, mochila, Pokédex, diálogo e combate.
3. **Só teclado e mouse (SC-002)**: o mesmo roteiro; os ícones de botão mudam ao trocar de dispositivo.
4. **HUD (SC-003)**: entrar em combate em 1280×720 e 1920×1080, com escala 0,75 e 1,5; nada cortado nem sobreposto.
5. **Diálogo (SC-004)**: no build de desenvolvimento, F4 abre o diálogo de teste (banco 18, texto 21: "Would you like to play with {nome} again?"); responder Sim, depois Não, depois cancelar (= Não).
6. **Ocupado (SC-005)**: com dois jogadores, abrir a mochila num; o outro vê "ocupado" em até 1 s; selvagens continuam se movendo. Em combate, o menu não abre e aparece o motivo.
7. **Persistência (SC-006)**: remapear uma tecla, mudar escala e velocidade do texto, reiniciar; tudo mantido.
8. **Itens**: usar uma Potion num Pokémon ferido (HP sobe, quantidade −1); outro item aparece indisponível.
