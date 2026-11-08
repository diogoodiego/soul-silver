# Modelo de dados: Itens

## Arquivos de dados (zod, validados no carregamento)

| Arquivo | Origem | Conteúdo |
|---------|--------|----------|
| `content/items/effects.json` | à mão | `use`: item → efeito que os bytes não dizem (`repel` com `levelFilter`, `escape-rope`, `none` com motivo); `held`: id de hold effect extraído → gatilho (`hp-threshold`, `cure`, `regen`, `type-boost`, `damage-mul`, `speed-mul`, `survive`, `crit`, `quick`, `cooldown-restore`, `none`) |
| `content/items/tuning.json` | à mão | tempo de uso e recarga por arquétipo de combate; `lockMovement`; `secondsPerPp`; `ppUp.perLevel` e `max`; Repel em passos, `stepS` e `density`; Dowsing (`radiusTiles`, `everyMs`); `berryYield`; `kurtDays`; `apricornBalls` (cor → bola); `regenS` |
| `content/companion/finds.json` | à mão (a tabela original não foi achada) | por lugar (`town`, `route`, `cave`, `indoor`): itens com peso; `everyS`, `chance` |
| `events/field-items.json` | extraído (estágio `events`) | itens escondidos (índice, item, quantidade, flag = 800 + índice), cor de cada árvore de apricorn, horas por estágio de cada berry |
| `items.json` (já existia) | extraído | bolso, preço, `partyUse` (cura, status, PP, revive, nível, evolução, estágios), `holdEffect` |

Os limites dos bolsos são constantes do motor do jogo em `shared/src/items/bag.ts` (`POCKET_LIMITS`), como `PC_ITEMS_MAX`. Cura, status, PP, Rare Candy, pedras e itens X saem dos bytes de `partyUse` (`shared/src/items/effects.ts`); bolas e máquinas, do bolso; itens-chave e correio são passivos.

## Save v11 (por jogador)

Ver [contracts/save-v11.md](contracts/save-v11.md): `held` e `ppUps` opcionais no membro; `apricorns`, `apricornTrees`, `berryPots`, `kurt`, `repel` no save. Itens do chão e escondidos usam as flags de evento existentes (a bola de item marca a hide flag do objeto; o escondido, a flag 800 + índice).

## Entidades e transições

- **Mochila**: `{ item, count }[]`; o bolso vem do item; `count` até a pilha do bolso; espécies por bolso até o limite. Script, loja, PC, chão, Kurt e achados passam por `addItem`/`canAdd`.
- **Uso em combate** (estado da sessão, não salvo): `livre → usando(endsAt) → recarga(até) → livre`; o item só é gasto ao fim do uso; desmaio, troca ou recolher cancelam sem gastar.
- **Berry Pot**: `vazio → plantada → brotou → crescendo → florescendo → madura → (colher) → vazio`, pelas horas por estágio da berry; relógio voltando mantém em "plantada".
- **Árvore de apricorn**: dá uma vez por dia por jogador.
- **Kurt**: `sem encomenda → encomenda(dia) → (dia seguinte) bola pronta → entregue`; a flag diária 2722 sai da data da encomenda.
- **Item segurado**: ligado ao membro; consumível vai embora ao agir e sai do save.
- **Repel**: `ativo(endsAt) → expirado` no relógio da sessão; selvagens já em luta não mudam.
- **Dowsing**: derivado, não salvo: escondido ainda não pego mais próximo no raio.

## Validações do servidor (FR-016)

Item na mochila; alvo existente e do jogador; efeito permitido no contexto (combate ou campo); compatibilidade (MT/MO no learnset, pedra na evolução, status presente, PP Up abaixo de 3, cura abaixo do máximo); nenhum uso ou recarga em andamento; limites do bolso ao adicionar; flag de coleta ainda desmarcada; prazo do Kurt cumprido; vaso no estado certo. Toda recusa devolve um `NoticeCode` e deixa o estado intacto.
