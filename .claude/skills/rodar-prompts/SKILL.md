---
name: rodar-prompts
description: Executa em sequência os próximos itens do roadmap do SoulSilver Desktop (docs/STATUS.md + docs/roadmap/), um commit por item. Use quando o usuário chamar /rodar-prompts, com ou sem a quantidade de itens.
argument-hint: "[quantidade de itens, padrão 1]"
disable-model-invocation: true
---

# Rodar prompts do roadmap

Executa os próximos N itens do roadmap, na ordem, sem pausar entre eles, e faz um commit
local por item. N vem de `$ARGUMENTS` (padrão 1). O objetivo é avançar vários itens com
pouca intervenção, mantendo cada item reversível por um commit próprio.

## 1. Preparar

1. Confira `git status --porcelain`. Se houver mudanças não commitadas, pare e pergunte ao
   usuário se deve commitá-las antes; misturar trabalho antigo com o do item quebra o
   "um commit por item".
2. Liste os itens a executar:
   `node .claude/skills/rodar-prompts/scripts/proximos.mjs <N>`
   O script lê o "Próximo item" de `docs/STATUS.md` e imprime os N prompts seguintes de
   `docs/roadmap/marco-*.md`, na ordem. Não abra os arquivos do roadmap inteiros: o script
   já traz só o que importa.
3. Mostre ao usuário a lista (ID e título) e comece, sem esperar confirmação.

## 2. Executar cada item

Para cada item, em ordem:

1. **Delegue a um subagente** (ferramenta Agent/Task, tipo general-purpose), passando o prompt
   do item inteiro e esta instrução: "Siga o CLAUDE.md. Não faça commit. Não pare para
   aprovação do plano: escreva o plano e siga. Se precisar de uma decisão do usuário, pare e
   devolva `BLOQUEADO: <motivo>`. No fim, devolva: arquivos alterados, testes rodados e
   resultado, e `CONCLUÍDO` ou `BLOQUEADO`." Cada item roda num contexto limpo, o que mantém
   esta sessão pequena e barata mesmo com muitos itens. Sem a ferramenta de subagente,
   execute o item você mesmo.
2. **Se o subagente devolver CONCLUÍDO**:
   - Atualize `docs/STATUS.md`: marque o item (`- [x]`; se a linha for um intervalo como
     `031.1–031.7`, marque só quando o último item do intervalo terminar), troque
     "Próximo item" pelo ID seguinte que o script indicou e registre pendências ou decisões
     novas, uma linha cada.
   - Commit local, sem push: `git add -A` e
     `git commit -m "feat(<ID>): <título em inglês, curto>"`. Para itens de verificação use
     `test(<ID>): ...`. O `.gitignore` já exclui ROM, assets e `.evidence/`; confira com
     `git status` que nada disso entrou antes de commitar.
   - Rode `graphify update .` se o CLAUDE.md pedir.
3. **Se devolver BLOQUEADO, ou falhar**: não commite, não siga para o próximo item. Pare e
   mostre o motivo ao usuário.

## 3. Quando parar antes de N

Pare (depois de commitar o item atual, se ele terminou) quando:
- um item falhar ou ficar bloqueado;
- o próximo item pedir algo que só o usuário faz: "espere meu relato", "minha confirmação",
  roteiro manual a ser executado por ele, ou "mostre a lista de ajustes propostos" antes de
  mudar balanceamento. Nesses, execute só a parte até o ponto de decisão, mostre o que for
  pedido e pare;
- uma regra de parada do CLAUDE.md se aplicar (apagar arquivos, nova dependência, schema de
  dados extraídos, regras de combate, 3 falhas seguidas);
- o item for `L.3`: nunca crie tag nem publique.

## 4. Relatório final

Uma tabela curta: ID, título, resultado (concluído / bloqueado), commit. Depois, as
pendências novas e o próximo item. Lembre o usuário de marcar as caixas dos itens concluídos
no documento do roadmap.
