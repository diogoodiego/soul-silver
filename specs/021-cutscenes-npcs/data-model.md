# Data Model: Cutscenes e NPCs

## Padrão de movimento (código, `shared/npc`)

- `kind`: `still` | `look` | `wander` | `path`
- `look`: `directions` permitidas, `interval` em ticks
- `wander`: `area` (xRange, yRange em tiles a partir da origem), `interval`
- `path`: lista de passos `{ dir, count }`, ciclo
- Origem: campo `movement` de `map-events` (R4); desconhecido → `still`

## Estado de NPC (servidor, volátil)

`person`, `area`, `x`, `y`, `facing`, `pattern`, `timer`, `rngState`. Não persiste: ao carregar o mapa volta à origem.

## Pedido de cutscene (servidor → cliente)

`id`, `actors[]` (`person` | `player` | `companion`), `steps[]`:

- Movimento: `walk { dir, count }`, `face { dir }`, `wait { ticks }`, `jump { dir, count }`, `show`, `hide`
- Câmera: `camera-move { to, ticks }`, `camera-lock { target }`, `camera-release`, `camera-shake { amplitude, ticks }`

Estados: `pendente → encenando → concluído` (resposta `script-answer`). Timeout e desconexão descartam.

## Jogador ocupado

`busy: boolean` na entidade do jogador, replicado aos demais. Regras: não recebe dano, não interage, não é alvo de selvagens. Limpo ao fim do script, timeout ou desconexão.

## Save v6

- Novo: `npcPlacement: Record<mapaId, Record<pessoaId, { x, z, facing }>>`, padrão `{}`
- Migração `5 → 6`: adiciona `npcPlacement: {}`; teste de ida, de volta ao carregar e de save v5 antigo.
- Opção de texto acelerado vive em Configurações (não no save do mundo).
