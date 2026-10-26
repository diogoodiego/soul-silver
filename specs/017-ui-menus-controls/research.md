# Research: Interface básica, menu inicial e controles

## R1 — Arte da tela de título

- **Decision**: novo estágio `title` no extrator, que localiza o arquivo gráfico da tela de título do HGSS com o probe de `nitro-gfx` já existente, decodifica as camadas (logo, fundo) e grava PNGs em `stages/title/`. Se o estágio falhar, o título usa fundo liso com o nome do app e registra o aviso no relatório.
- **Rationale**: o grep em `packages/extractor/src` mostra que nenhum estágio extrai a tela de título hoje. Reaproveitar o decodificador de sprites evita código novo de formato. O caminho exato do arquivo na ROM se confirma com o probe na implementação.
- **Alternatives**: desenhar uma arte própria (fere o princípio I); distribuir a arte (fere o princípio II).

## R2 — i18n da interface

- **Decision**: `client/src/i18n/pt-BR.ts` exporta um objeto de chaves → strings com `{var}`; `t(key, vars)` tipado pelas chaves. Locale único `pt-BR` agora, o mesmo das mensagens que já vêm do processo principal (saves, sessões, ROM); um `en.ts` com as mesmas chaves entra depois sem mudar as telas. Textos do jogo (diálogos, Pokédex, itens) continuam vindo do catálogo em inglês.
- **Revisão (implementação)**: a primeira versão escolhia `en`; trocar só o cliente para inglês deixaria a interface misturada com as mensagens do processo principal.
- **Rationale**: a constituição pede i18n estruturada desde o início; um dicionário tipado basta e falha no build se faltar chave.
- **Alternatives**: svelte-i18n / i18next (dependência para poucas dezenas de chaves).

## R3 — Mapa de controles

- **Decision**: `shared/input/bindings.ts` define as ações (`up, down, left, right, confirm, cancel, menu, tabPrev, tabNext, run, dash, move1–4, combat, recall, interact, picker, throw, nextBall`), os padrões do teclado (os de hoje em `input.ts`, mais Enter/Espaço = confirmar, Esc/Backspace = cancelar, Tab = menu, Q/E = abas no menu) e os padrões Xbox pela Standard Gamepad mapping (A confirma, B cancela, Start = menu, LB/RB = abas). Atribuir uma tecla já usada troca as duas ações. Teclas reservadas (F11, Alt+F4, Meta) são recusadas. O gamepad não é remapeável nesta etapa.
- **Rationale**: tira a tabela fixa marcada como `shortcut:` em `input.ts`; puro e testável.
- **Alternatives**: remapear o gamepad também (pedido só fala de teclas; o layout Xbox fica fixo).

## R4 — Navegação só com gamepad ou teclado

- **Decision**: `input/focus.ts` mantém o foco do DOM: cima/baixo/esquerda/direita movem para o próximo elemento focável na direção (busca pela posição dos retângulos), confirmar faz `click()`, cancelar chama o `onBack` da tela atual. O mouse continua com clique nativo. Um polling do gamepad a cada quadro gera as ações com repetição ao segurar (400 ms, depois 120 ms).
- **Rationale**: botões nativos dão acessibilidade e mouse de graça; só falta o direcional do gamepad.
- **Alternatives**: grade de navegação declarada por tela (mais código por tela).

## R5 — Ícones conforme o dispositivo

- **Decision**: `input.ts` já guarda `lastDevice`; vira um store Svelte lido por um componente `<Glyph action>` que mostra a tecla ligada ou o botão Xbox.

## R6 — Menus não pausam, "ocupado" e bloqueio em combate

- **Decision**: o cliente manda `{type:"menu", open}` ao abrir/fechar o menu completo. O servidor grava `data.busy` na entidade do jogador (vai no delta de estado) e responde `notice` com código `menu-blocked` se `companions.inCombat()`; ao entrar em combate com menu aberto, zera `busy` e o cliente fecha o menu ao ver o modo de combate. A entrada de movimento é zerada pelo cliente enquanto o menu está aberto, mas a simulação segue.
- **Rationale**: reaproveita `data` das entidades e `notice` já existentes; mudança mínima no protocolo.
- **Alternatives**: estado de menu inteiramente local (os outros não veriam "ocupado").

## R7 — Reordenar equipe e usar item

- **Decision**: mensagens `reorder-party {from,to}` e `use-item {item, partyIndex}`. O servidor valida índices e posse, aplica e reenvia `party` e `bag`. Só Potions (cura vinda do dado do item) e Poké Balls (fluxo do spec 15, só em combate pela ação de arremesso) funcionam; outros itens recebem `notice` `item-unavailable`. Reordenar fica recusado em combate.
- **Rationale**: servidor autoritativo; reaproveita as mensagens `party` e `bag` existentes.

## R8 — Caixa de diálogo

- **Decision**: componente `DialogBox` com uma fila: `say(key, vars)` e `ask(key, vars) → Promise<boolean>`. Formata com `shared/text` (variáveis do spec 5; `trainer-name` = nome do jogador). Velocidades da ROM: lenta 8, média 4, rápida 1 quadro por caractere (a 60 fps). Confirmar completa o texto; confirmar de novo avança; cancelar na pergunta = Não. O interpretador de scripts (spec 19) usará essa mesma API.

## R9 — HUD legível em 720p e 1080p

- **Decision**: o HUD usa `rem` com `html { font-size: calc(clamp(14px, 1.5vh, 20px) * var(--ui-scale)) }`; escala da interface 0,75–1,5 em passos de 0,25. Cores de tipo vêm de uma tabela de 17 tipos (`TYPE_KEYS`). Cooldown é um anel CSS `conic-gradient` com os segundos restantes.
- **Rationale**: só CSS, sem medir a tela em código.

## R10 — Configurações de janela

- **Decision**: `AppSettings` ganha `window: {width,height}` (1280×720, 1600×900, 1920×1080), `fullscreen`, `textSpeed`, `uiScale` e `bindings`. `setSettings` grava e o processo principal aplica `setContentSize`/`setFullScreen` na hora. Arquivos antigos recebem defaults.

## R11 — Resumo de save com insígnias

- **Decision**: `SlotSummary` (ok) ganha `badges`, lido do save no `save-store`. Sem mudança de schema do save.

## R12 — Fluxo até o mapa em 4 escolhas

- **Decision**: título (1: qualquer botão) → Jogar (2) → save (3) → Sozinho (4) → mapa. O último save usado já vem focado.
