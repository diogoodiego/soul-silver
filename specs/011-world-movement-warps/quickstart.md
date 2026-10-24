# Quickstart: Mundo, movimento e warps

## Pré-requisitos

- ROM extraída localmente com os estágios de mapas (006), sprites (007) e eventos (008).
- `npm install` na raiz.

## Testes automatizados

```sh
npx vitest run packages/shared/test/game   # passo de movimento, ressaltos, níveis, warps, vizinhos
npx vitest run packages/server/test        # loader de mundo, warps reais do percurso (SC-005), determinismo
```

Esperado: tudo verde. O teste de warps do percurso roda contra a extração local e é pulado se ela faltar.

## Conferência manual (SC-001 a SC-003)

1. `npm run dev` e iniciar um jogo solo; o jogador aparece em New Bark Town.
2. Andar contra casas, cercas, árvores e água nas 4 direções (teclado) e com o analógico: nada atravessa; sem eixo diagonal, o personagem só para no obstáculo.
3. Segurar Shift / botão de correr: velocidade dobra.
4. Entrar e sair da casa do jogador, das casas vizinhas e do laboratório: fade, input travado durante, retorno na porta.
5. Ir para a Route 29 atravessando a divisa 10 vezes: sem pausa, tela preta ou pedaço vazio (SC-002).
6. Pular um ressalto para baixo; tentar subir por ele: bloqueia.
7. Passar na grama alta: pés cobertos. Passar atrás de telhados e árvores: jogador coberto.
8. Chegar a Cherrygrove, entrar no Centro Pokémon e no Mart, voltar a New Bark.
9. Redimensionar a janela e usar tela cheia (F11): pixels nítidos, barras quando necessário.
10. Com 4 clientes na mesma área, o painel de debug (010) mostra ≥ 60 fps (SC-003).

## Resultado (2026-10-24, parcial)

Conferido no app compilado (`npm run build -w @soulsilver/app`, Electron com `--remote-debugging-port`):
passos 1, 2 (árvores bloqueiam), 4 (porta da casa do jogador: entra com fade, sai pelo tapete) e 5
(New Bark → Route 29 sem pausa, os dois mapas na tela). Pendentes: 3 (corrida), 6 a 10.

Ao abrir o Electron a partir de um terminal do VS Code, remova `ELECTRON_RUN_AS_NODE` do ambiente,
senão ele roda como Node puro.
