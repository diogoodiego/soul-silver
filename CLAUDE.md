# SoulSilver Desktop

Remake de Pokémon SoulSilver para Windows (Electron, TypeScript strict, three.js + Svelte),
com servidor autoritativo em Node a 20 Hz e multiplayer LAN de 2 a 4 jogadores.
Pacotes: `app`, `client`, `server`, `shared` (tipos, protocolo, schemas), `extractor`.
Dados de design em `content/`.

## Antes de começar

1. Leia `docs/STATUS.md`: diz o que já foi feito, o próximo item e as decisões em vigor.
   O prompt de cada item pendente está em `docs/roadmap/marco-N.md` (procure pelo ID).
2. Confira que os itens anteriores do mesmo bloco estão concluídos. Se não estiverem, pare e avise.
3. Não leia `specs/` nem `.specify/` por padrão: são histórico do Spec Kit, que não é mais usado.
   Abra só se o item pedir. Para a história de um item, use `git log --grep <ID>`.
4. Princípios completos em `.specify/memory/constitution.md`; consulte só em caso de dúvida.

## Regras

- Faça só o que o item pede. Antes de editar, mostre um plano de até 10 linhas (arquivos e testes).
- Test-first em lógica (combate, scripts, servidor, protocolo, extrator, saves). Render e UI
  ficam isentos de teste-first.
- Testes e verificações rodam só no servidor (vitest, harness, golden, sondas). Nunca abra o app
  (Electron, skill `run-soulsilver`) nem faça capturas por conta própria: só se o desenvolvedor pedir.
- Testes da CI só com fixtures sintéticos. A ROM real (na raiz, ignorada) é usada só localmente.
  ROM, assets e capturas nunca entram no git; capturas vão para `.evidence/<bloco>/`.
- Mudou protocolo ou save: suba a versão (`packages/shared/src/protocol-version.ts`, `schemaVersion`)
  e escreva a migração com teste.
- Código, identificadores e commits em inglês; documentação em PT-BR.
- Tipografia no cliente: só a escala do Tailwind (`text-xs`, `text-sm`, `text-base`, `text-lg`...). Nada de tamanhos
  customizados como `text-[0.8em]`, `text-[0.75rem]`, `text-[11px]` ou `font-size` inline.
- Cores do cliente: só os tokens semânticos do `@theme` em `packages/client/src/app.css` (coleção "Soul Silver" do
  Figma). `surface/sunken` é só fundo de input; `surface/hover`, `surface/selected` e os `bg-hover`/`bg-pressed`
  das ações são camadas sobre o fundo (`layer-*`), nunca fundo próprio; botão secundário e ghost são transparentes;
  `status/*` ainda não é usado.
- Pare e pergunte antes de apagar arquivos, adicionar dependência, mudar schema de dados
  extraídos ou mudar regras de combate. Pare e relate se a mesma falha persistir após 3 tentativas.
- Não faça commit. O desenvolvedor commita, com o ID do item na mensagem: `feat(030.7): ...`.
  A exceção é a skill `/rodar-prompts`, que faz um commit local por item (sem push).

## Verificação

Itens comuns (verificação leve, para economizar):
- Rode só os testes do que mudou: `npx vitest related --run <arquivos alterados>` e os testes
  novos do item. Não rode `typecheck`, `lint`, a suíte inteira nem `npm run golden`.
- Se o "Pronto quando" pedir uma sonda com a ROM real, rode só essa sonda.
- Sem app e sem capturas.

Item de verificação (o último de cada bloco), completo:
1. `npm run typecheck`, `npm run lint`, `npm test` (unidade e harness `packages/server/test/harness.ts`).
2. ROM real, local: `npm run golden` e as sondas do bloco em `packages/app/golden/`.
3. Manual, para o que o servidor não verifica (visual, sensação de controle, som, legibilidade):
   roteiro escrito para o desenvolvedor em `.evidence/<bloco>/`. Não abra o app.
- Corrija o que essas verificações revelarem nos itens do bloco, incluindo erros de tipo e de lint.

## Ao terminar um item

- Marque o item em `docs/STATUS.md`, atualize "Próximo item" e registre em "Decisões" só o que
  muda o rumo de itens futuros (uma linha cada). Pendências que ficaram vão para "Pendências".
- No fim, liste arquivos alterados, testes adicionados e o resultado de cada verificação.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
