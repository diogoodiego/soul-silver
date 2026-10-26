# Contrato: ações de interface e controles padrão

| Ação | Teclado (padrão, remapeável) | Gamepad Xbox (fixo, Standard mapping) |
|------|------------------------------|----------------------------------------|
| up/down/left/right | W/S/A/D, setas | analógico esquerdo; D-pad só nos menus |
| confirm | Enter, Espaço* | A (0) |
| cancel | Esc, Backspace | B (1) |
| menu | Tab, Esc | Start (9) |
| tabPrev / tabNext | Q / E* | LB (4) / RB (5) |
| run | Shift | B (1) segurado no mapa |
| dash | Espaço | LB (4) |
| move1–4 | 1–4 | A, X, Y, RB |
| combat / recall | F / R | LT (6) / RT (7) |
| interact | E | D-pad ↑ (12) |
| picker | Q | View (8) |
| throw | G | LS (10) |
| nextBall | B | D-pad → (15) |

\* Espaço, Q e E têm um significado no mapa e outro dentro dos menus; o conflito só vale dentro do mesmo contexto (mapa ou menu).

O layout Xbox tem 12 botões fora do D-pad e o mapa usa 13 ações, então no mapa o D-pad deixa de andar (o analógico anda) e leva `interact` e `nextBall`; nos menus ele volta a ser o cursor. `interact` saiu de View e `picker` saiu de Start, que agora abre o menu. Fonte: `packages/shared/src/input/bindings.ts`.

Regras:
- O ícone exibido (`<Glyph action>`) segue o último dispositivo usado.
- Na tela de título, qualquer tecla, clique ou botão avança.
- Segurar um direcional repete a ação: 400 ms, depois a cada 120 ms.
