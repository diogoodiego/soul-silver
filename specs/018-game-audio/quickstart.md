# Quickstart: Áudio no jogo

**Feature**: [spec.md](spec.md)

## Pré-requisitos

- Extração completa com a etapa de áudio (feature 009): `npm run extract -- --rom <arquivo>`, relatório de áudio `ok`.
- `content/audio/cues.json` com nomes que existem no `audio-index` (ver [contracts/audio-cues.md](contracts/audio-cues.md)).

## Testes automatizados (sem ROM)

```sh
npm test -w packages/shared -- audio settings
npm test -w packages/server -- wild
```

Esperado: diretor de música, mixer, resolução de golpe → som, schema de cues, settings de áudio e a
flag `alert` passam.

## Conferência manual (com a ROM)

Rodar o app (skill `run-soulsilver`) e conferir:

1. Tela de título toca a música de título.
2. New Bark Town → Route 29 → laboratório: crossfade em cada troca, sem silêncio nem corte (SC-001).
3. Entrar e sair de prédios com a mesma música: a faixa não reinicia (SC-005).
4. Deixar uma faixa passar do fim: o loop volta sem repetir a introdução.
5. Combate com selvagem: música de batalha em até 1 s (SC-002); vencer → fanfarra → música do lugar; capturar → sem fanfarra.
6. Golpes, acertos de efetividades diferentes, Poké Ball (arremesso, balançadas, captura e escape), menus.
7. Cry ao lançar, ao desmaiar e quando um selvagem agressivo nota o jogador.
8. Sessão LAN com 4 jogadores em combate: 60 fps no overlay de debug e efeitos próprios audíveis (SC-003); um jogador fora do combate ouve a música do lugar.
9. Configurações → Áudio: cada volume muda na hora; reabrir o app mantém os valores (SC-004); com "silenciar sem foco", trocar de janela silencia.
