# Contrato: save v8

Mudanças sobre v7 (`SAVE_SCHEMA_VERSION` 7 → 8):

- `rivalName: string` (0..`PLAYER_NAME_MAX`), padrão `""`.
- `storyRev: int ≥ 0`. 0 = história desatualizada; 1 = criado com o estado inicial desta feature.

Migração 7→8 (testada): acrescenta `rivalName: ""` e `storyRev: 0`; não toca em mais nada.

`save-store.create(slot, name, character, overwrite)`: sem `starter`; grava `storyRev = 1` e o estado de `new-game.json` (posição, flags, vars) via `applyNewGame`.

`save-store.restartStory(slot)`: lê o save, aplica `restartStory` (mantém nome, personagem, tempo, `rev`), grava de forma atômica com backup. Falha se o slot estiver vazio/corrompido.

Cliente: ao carregar com `storyRev < 1`, mostra "história desatualizada" com **Recomeçar a história** (confirmação explícita, pois apaga progresso do slot; o backup anterior é mantido) e **Continuar sem garantia**.
