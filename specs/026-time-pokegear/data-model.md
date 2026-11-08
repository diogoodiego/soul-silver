# Data Model: Tempo e Pokégear

## Relógio da sessão (memória do servidor, não vai ao save)

| Campo | Tipo | Regra |
|-------|------|-------|
| `mode` | `host` \| `fixed(at)` \| `offset(ms)` | só `debugSetClock` muda; `host` por padrão |
| derivados | `now`, `hour`, `minuteOfDay`, `weekday` (0 = domingo), `band` | puros a partir de `mode` e da fonte |

`band`: `morning` \| `day` \| `night`, de `spawn.json` → `timeBands`.

## Tonalidade (`content/time/tint.json`)

`{ morning: Rgb, day: Rgb, night: Rgb, transitionMinutes: int ≥ 0 }`, com `Rgb` = três números em [0, 1.5]. Erro de schema com arquivo e caminho do campo.

## Estado de telefone por jogador (save v10, `phone`)

Ver [contracts/save-v10.md](contracts/save-v10.md): `contacts`, `seeking`, `called`, `pending` e `log`. A revanche é só `seeking` (research R7.4). "Venceu" é a flag de treinador por jogador que já existe, e o time `_N` sai da tabela de revanche.

## Dados extraídos (estágio `phone`, `packages/shared/src/phone/schemas.ts`)

`phone.json`:
- `contacts[]`: `id`, `type`, `trainerClass`, `trainer`, `map`, `gift`, `localScript`, `rematchWeekday` (0–6, 7 é "sem dia"), `rematchTime` (0–2, 3 é "sem faixa"), `tier`, `greeting` (linha de cumprimentos, `unkC`; 255 é nenhuma), `bank`, `outgoing` e `incoming` (até 8 cabeçalhos `{ type, chance, scriptType, script }` cada). Vem de `tel/pmtel_book.dat`, `sPhoneMessageGmm` (ARM9) e `sGenericPhoneCallHeaders` (overlay 101).
- `scripts[]`: `id` (1 a 455), `lines` (o par masculino/feminino, índices no banco do contato que liga), `type` (4 bits), `param0` (12 bits), `param1`. Vem de `gPhoneCallScriptDef` (overlay 101).
- `greetings[]`: `sGreetingMsgIDs`, 8 linhas de 12 ids do banco 640 (feita/recebida × manhã/dia/noite × masculino/feminino; overlay 101).
- `rematchSets[]`: `base` (a coluna 0, o id que o script passa) e `sequence` (as colunas 1 a 5; 0 encerra, 0xFFFF é um passo pulado). Vem de `sTrainerRematchSets` (overlay 26).

Escritos à mão: `content/phone/callers.json` (as regras de roteiro das ligações feitas ao Elm e à mãe, por flag, até Violet City) e `content/phone/scripted-calls.json`, o `PHONE_SCRIPT` de cada índice das ligações de script (`SetPhoneCall` com `isScriptedCall` 2), só ids, com a origem citada. Cabeçalho de mapa: `incomingCalls` (bit 6 do byte 23; estágio `maps` versão 9).

O rádio não tem arquivo extraído: os textos já estão no catálogo (bancos 409 a 420).

## Rádio (`content/radio/channels.json`, `packages/shared/src/radio/schemas.ts`)

`shows[]` (`id`, `bank`), `baseRate` (40) e `music: { march: 25, lullaby: -25 }`. `baseRate + music` precisa ficar acima de 0. O fator sobre o teto de spawns é `(baseRate + Δ) / baseRate`.

## Estado em memória por jogador

`radio.tuned: channelId | null`; `call: { id, startedAt } | null`. Nenhum vai ao save.

## Mensagens (ver [contracts/protocol-v20.md](contracts/protocol-v20.md))

Relógio, ligações, rádio e comando de desenvolvimento.
