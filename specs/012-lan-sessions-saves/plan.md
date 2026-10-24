# Implementation Plan: LAN, sessões e saves

**Branch**: `012-lan-sessions-saves` | **Date**: 2026-10-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/012-lan-sessions-saves/spec.md`

## Summary

Liga o menu inicial ao servidor autoritativo: saves em 3 slots no PC do jogador (JSON com
`schemaVersion`, gravação atômica com backup, migração encadeada), sessões solo ou hospedadas sobre
o mesmo servidor, transporte WebSocket para convidados (sobre a interface `Connection` da feature
010), descoberta por broadcast UDP e conexão manual por IP. O `hello` passa a levar o save, que o
servidor valida com o schema compartilhado e regras de coerência; o servidor devolve o save
atualizado (`save` periódico, em warps e no fim da sessão) e mantém o lugar de quem cai por 2 min.

## Technical Context

**Language/Version**: TypeScript strict; Node.js do Electron (main e `utilityProcess` do servidor)

**Primary Dependencies**: zod (já usado), `ws` (servidor WebSocket no processo do servidor;
única dependência nova), `node:dgram` (descoberta), Svelte 5 (menus)

**Storage**: arquivos JSON em `app.getPath("userData")/saves/slot-{1..3}.json` + `.bak`

**Testing**: vitest (shared, server, app main, client net), em Node puro

**Target Platform**: Windows 10/11 64 bits

**Project Type**: desktop-app (Electron, monorepo)

**Performance Goals**: partida visível na LAN em ≤ 5 s; gravação de save sem afetar o tick de 20 Hz

**Constraints**: renderer sem rede direta (princípio IX); 2–4 jogadores; save ≤ 1 MB

**Scale/Scope**: 1 host + até 3 convidados; 3 slots por PC

## Constitution Check

| Princípio | Status | Nota |
|-----------|--------|------|
| IV Servidor autoritativo, solo = mesmo servidor | ✅ | Solo usa o mesmo `createGameServer`; só não abre WebSocket nem anuncia. |
| V Test-first | ✅ | Schema, coerência, migração, store atômico, descoberta (codec + listagem), sessão (nome único, reserva, save final) com teste antes. UI verificada à mão. |
| VI Contratos versionados | ✅ | Save, mensagens e anúncio em `shared`; `PROTOCOL_VERSION` 3 → 4; `SAVE_SCHEMA_VERSION` 1 + registro de migrações testado. |
| VII Progresso individual | ✅ | Save por jogador; o servidor só guarda o estado de quem está na sessão. |
| VIII Saves no PC do jogador | ✅ | Gravação atômica + backup; host valida antes de aceitar. |
| IX Segurança do Electron | ✅ | Rede, disco e diálogos ficam no main/servidor; renderer só via `window.soulSilver`. |
| X Simplicidade | ✅ | Uma dependência (`ws`); descoberta com `dgram` em vez de mDNS. |
| Modelo de confiança | ✅ | Validação de forma e coerência no host; sem anti-cheat. |

Sem violações. Re-checado após Phase 1: sem mudanças.

## Project Structure

### Documentation (this feature)

```text
specs/012-lan-sessions-saves/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── save-file.md
│   ├── game-protocol-v4.md
│   ├── lan-discovery.md
│   └── ipc.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
packages/shared/src/
├── save/                    # NOVO: schema, coerência, migrações, slot summary
│   ├── schema.ts
│   ├── coherence.ts
│   ├── migrate.ts
│   └── index.ts
├── lan/discovery.ts         # NOVO: codec do anúncio UDP
├── game/protocol.ts         # hello com save; save/reject codes novos; resume
└── ipc.ts                   # canais de saves, sessão, descoberta

packages/server/src/
├── session.ts               # nome único, carregar save, reserva de 2 min, save periódico/final
└── game-server.ts           # modo solo/host; mensagens de host novas

packages/app/src/
├── main/save-store.ts       # NOVO: slots, gravação atômica + .bak, export/import
├── main/discovery.ts        # NOVO: anunciar e escutar (dgram)
├── main/server-host.ts      # iniciar sessão solo/hospedada; ponte das conexões remotas
├── main/remote-connection.ts# NOVO: cliente WebSocket do convidado (main → host)
└── server-host/entry.ts     # servidor WebSocket (ws) quando hospedado

packages/client/src/
├── MainMenu.svelte          # NOVO: Novo jogo, Continuar, Hospedar, Entrar, Jogar sozinho
├── NewGame.svelte, SaveSlots.svelte, JoinGame.svelte, FirewallNotice.svelte  # NOVOS
└── App.svelte, GameSession.svelte  # rotas e fim de sessão/reconexão
```

**Structure Decision**: segue o monorepo existente; nenhum pacote novo. Lógica pura (schema,
migração, coerência, codec de descoberta) em `shared`; regras de sessão em `server`; disco e rede
no `app`; telas no `client`.

## Complexity Tracking

Nenhuma violação a justificar.
