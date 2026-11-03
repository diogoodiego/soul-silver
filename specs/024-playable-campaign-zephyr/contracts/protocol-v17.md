# Contrato: protocolo v17 (16 → 17)

Clientes de versão diferente recusam a conexão (princípio VI).

## Nome do rival

- Servidor → cliente: `script` com `request: { kind: "name", purpose: "rival" }` (`NameRival`).
- Cliente → servidor: `script-answer` com o mesmo `id` e `text` (até `PLAYER_NAME_MAX`).
- Buffer de mensagem `{ kind: "rival", name }` (`BufferRivalsName`): o servidor manda o nome que está no save.

## Música de script

`script-event` ganha `{ kind: "bgm-reset" }` (`ResetBGM`): o cliente volta à música do mapa.

## Depurador de scripts

`script-debug` (enviado só com `debugScript` ligado) ganha:

- `objects: [{ id, sprite, hideFlag: number | null, visible }]`: objetos do mapa atual;
- `triggers: [{ kind: "mapScript" | "trigger", script: "arquivo:entrada", condition: string, met }]`;
- `changes: [{ tick, kind: "flag" | "var", id, value, script }]`: até 64, do mais antigo ao mais novo; `script` é `arquivo:entrada` ou `dev`.

A condição é texto sem idioma: `var 0x4106 = 2` para scripts de mapa (o valor pode ser `var 0x…`) e `var 0x4072 = 0 @ (x, z) l×a` para gatilhos, em tiles da matriz; `met` avalia só a variável. `objects` e `triggers` são do mapa atual do jogador. `changes` registra só escritas que mudam o valor, feitas por scripts ou pelo depurador, e é mantido mesmo com o depurador desligado.

## Teleporte de desenvolvimento

Cliente → servidor: `{ type: "debugWarp", map, tx, ty }`, aceito só em builds de desenvolvimento e no caminho dourado (US6).

Cliente → servidor: `{ type: "debugSetHp", hp }` (`hp` ≥ 1): o HP de cada membro da equipe passa a `hp`, limitado ao máximo de cada um. Mesmas travas do `debugWarp` (depurador ligado e build de desenvolvimento); recusado com uma linha no log. Usado no check do Centro do caminho dourado.

## Estou preso

Cliente → servidor: `{ type: "rescue" }`, da opção "Estou preso" nas configurações. O servidor interrompe o script em andamento, leva o jogador a `respawn` (ou à porta de casa) e responde `{ type: "rescued" }`, com que o cliente limpa diálogo, cena e prompts. Durante combate, na arena ou com loja/PC abertos por script, recusa com `notice` `action-refused`.

## Fora do protocolo

O aviso de história desatualizada (`staleStory`) está no resumo de slot do IPC (T041), e recomeçar a história é uma ação do app.
