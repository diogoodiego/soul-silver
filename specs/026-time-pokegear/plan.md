# Implementation Plan: Tempo e Pokégear

**Branch**: `026-time-pokegear` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/026-time-pokegear/spec.md`

## Summary

O servidor já lê `hour()` e `weekday()` em três lugares (spawns, reações do companheiro, `GetWeekday` do interpretador), cada um com seu próprio `new Date()`. O Pokégear já tem um atalho de ligação (Elm, `1:2:0`) e quatro comandos que fingem não haver telefone. O plano:

1. **Um relógio só, injetável.** `SessionClock` em `shared/time` (puro: `now()`, `hour`, `minuteOfDay`, `weekday`, `band`). O servidor recebe uma fonte (`() => Date`); o relógio da sessão aplica por cima um deslocamento ou um valor fixo, que só o comando de desenvolvimento muda. `hour`, `weekday` e o `clock` do save passam a sair dele ([research R1](research.md)).
2. **Tonalidade como função pura.** `tintAt(minuteOfDay, palette)` em `shared/time/tint.ts`, interpolação linear contínua entre as cores de manhã, dia e noite, com janela de transição centrada em cada limite de faixa; paleta em `content/time/tint.json`. O servidor só envia o instante da sessão (minuto do dia, dia da semana, se está fixado); o cliente calcula e aplica a cor aos mapas `outdoor` ([R2](research.md)).
3. **Eventos por dia e horário nos scripts.** O original resolve isso com `GetWeekday`/`GetTimeOfDay` dentro dos scripts de carga do mapa. O que falta é conferir que o servidor roda esses scripts na entrada do mapa e que `GetTimeOfDay` existe; a sonda da camada 3 varre os dados para listar cada caso até Violet City ([R3](research.md)).
4. **Telefone no servidor.** `server/phone.ts`: contatos, fila de ligações por jogador, entrega só quando `field.busy(id)` for falso (o mesmo teste que já cobre menu, script, combate e treinador), e revanche. Estado por jogador no save v10 ([R4, R5](research.md)). Os atalhos `SetPhoneCall`/`RunPhoneCall`/`RegisterGearNumber`/`CheckRegisteredPhoneNumber`/`GetPhoneBookRematch` passam a falar com ele.
5. **Rádio com efeito em dados.** `content/radio/channels.json` (efeito por canal, escrito à mão com a origem citada) mais os textos extraídos. O efeito é um multiplicador do teto de spawns da área, aplicado em `wild.ts` ([R6](research.md)).
6. **Pokégear em Svelte.** Quatro abas em `client/src/gear/`; abre pelo menu (nova `MenuPage` `"gear"`), conta como menu aberto. Mapa reusa a base do `FlyMap.svelte`.
7. **Desenvolvimento.** `debugSetClock` (fixar, avançar, soltar), com o mesmo portão `devTools` dos comandos do spec 025.
8. **Contratos.** Protocolo 19 → 20, save 9 → 10, três arquivos de dados novos e um estágio do extrator novo.

**Risco maior (não resolvido):** onde ficam na ROM a tabela de contatos, os textos de ligação, os times de revanche e os canais do rádio. O spec presume que existem; nenhum dos formatos foi lido ainda. A primeira tarefa é uma sondagem ([R7](research.md)), e se ela falhar o escopo de US3/US4 muda.

## Technical Context

**Language/Version**: TypeScript strict; Node.js do Electron

**Primary Dependencies**: zod (já usado). Nenhuma nova.

**Storage**: save v10 (`phone`); `content/time/tint.json`, `content/radio/channels.json` (escritos à mão); estágio novo `phone` do extrator (`phone.json`: contatos, ligações, times de revanche; `radio.json`: canais e textos)

**Testing**: vitest com fixtures sintéticas (shared, server, extractor, save, client); extensão do caminho dourado em `packages/app/golden/` (local, `SOULSILVER_ROM`); driver da skill `run-soulsilver` para as 9 capturas

**Target Platform**: Windows 10/11 64 bits

**Project Type**: desktop-app (Electron, monorepo)

**Performance Goals**: sem regressão do tick de 20 Hz. A sessão envia o relógio só ao entrar, ao mudar por comando e a cada 5 s de relógio real (o cliente interpola); a verificação de ligações roda a cada passo de tile do jogador, como no original (research R7.3), não por tick.

**Constraints**: servidor autoritativo; nada da ROM no repositório; fixtures sintéticas; estado por jogador (VII); o relógio é da sessão, não do jogador

**Scale/Scope**: 3 faixas, 7 dias, 4 abas, contatos e canais conforme a ROM (a contar na sondagem), 1 comando de desenvolvimento

## Constitution Check

| Princípio | Conformidade |
|-----------|--------------|
| I. Conteúdo fiel | OK no que vem da ROM: textos, contatos, times de revanche, canais. Desvios a registrar em `docs/balance-log.md`: paleta de tonalidade (o original troca de paleta, aqui é interpolação contínua) e efeito do rádio como multiplicador de teto de spawns (o original muda a taxa de encontro aleatório). |
| II. Assets nunca distribuídos | OK. `phone.json` e `radio.json` são extraídos para a pasta do usuário; `tint.json` e `channels.json` são só números e referências a ids, sem texto da ROM. A extensão do caminho dourado lê a ROM por variável de ambiente, fora da CI. |
| III. Data-driven | OK. Faixas já em `spawn.json`; paleta, efeitos de rádio e agenda de ligações em arquivos com schema zod. |
| IV. Servidor autoritativo | OK. Relógio, faixa, entrega e aceite de ligação e efeito do rádio são decididos no servidor; o cliente desenha a cor a partir do instante recebido e pede ligar, atender e sintonizar. |
| V. Test-first | Aplicável (relógio, faixa, tonalidade, condição por dia, efeito do rádio, fila de ligações, revanche, migração, protocolo, extrator). Testes vermelhos primeiro. UI e render (abas, tonalidade) isentos, verificados na camada 4. Camadas 3, 4 e 5 listadas no spec. |
| VI. Contratos versionados | Save 9 → 10 com migração testada; protocolo 19 → 20; schemas em `shared`. |
| VII. Progresso individual | OK. Contatos, ligações pendentes, revanche e canal sintonizado são por jogador; o relógio é da sessão por definição do spec. Selvagens continuam compartilhados: o canal de cada jogador só pesa no teto da área quando ele está nela ([R6](research.md)). |
| VIII. Saves locais | OK. Só o campo `phone` novo; gravação atômica existente. |
| IX. Segurança do Electron | Não afetado. `debugSetClock` viaja no protocolo e só vale com `devTools`. |
| X. Desempenho e simplicidade | Sem dependência nova; reusa `field.busy`, `FlyMap`, o `MenuPage` e o portão de dev. Verificação de ligações por passo de tile (R7.3). |
| XI. Entrega incremental | Marcos: US1 (relógio e tonalidade) → US2 (eventos por dia) → US4 (ligações e revanche, que dependem do relógio) → US3 (as outras abas). US4 antes de US3 porque a extensão do caminho dourado precisa do telefone, não do rádio. |

Reavaliação pós-design: sem violações; nenhuma entrada em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/026-time-pokegear/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── protocol-v20.md
│   └── save-v10.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/
├── time/                # novo: clock.ts, tint.ts, schemas.ts (paleta)
├── phone/               # novo: contacts.ts (regras puras), calls.ts (agenda e fila), schemas.ts
├── radio/               # novo: channels.ts (efeito), schemas.ts
├── save/                # schema.ts (v10), migrate.ts
├── game/protocol.ts     # clock, phone-*, radio-*, debugSetClock
├── script/handlers/story.ts   # atalhos de telefone passam ao host
└── protocol-version.ts  # 20
packages/extractor/src/phone/    # estágio novo: phone.json, radio.json
packages/server/src/
├── clock.ts             # relógio da sessão (fonte + deslocamento/fixo)
├── phone.ts             # fila, entrega, revanche
├── radio.ts             # canal por jogador
├── wild.ts              # multiplicador de teto por canal
├── session.ts           # hour/weekday vindos do relógio; mensagens novas; debugSetClock
└── scripts.ts           # host: registrar número, rematch, chamada; oferta do número (scr_seq_0953.s)
# trainer-battle.ts: a revanche entra na conversa com o treinador vencido (o servidor não roda o script 953)
packages/app/golden/     # extensão do caminho dourado: Joey, Elm, dias da semana
packages/client/src/
├── gear/                # Gear.svelte, MapTab, PhoneTab, RadioTab, ClockTab, CallScreen
├── render/              # tonalidade dos mapas outdoor
└── game/menu-page.ts    # "gear"
content/time/            # tint.json
content/radio/           # channels.json
```

**Structure Decision**: segue o monorepo existente; regras puras em `shared`, orquestração por sessão em `server`, abas em `client/src/gear`.

## Complexity Tracking

Sem violações a justificar.
