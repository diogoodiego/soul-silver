# Data Model: Fundação do projeto

**Feature**: [spec.md](./spec.md) | **Date**: 2026-10-23

Esta feature não persiste dados. As entidades abaixo são tipos em memória definidos em
`packages/shared` (exceto `ForbiddenFileRule`, que vive em `scripts/`).

## ProtocolVersion

| Campo | Tipo | Regra |
|-------|------|-------|
| `PROTOCOL_VERSION` | inteiro constante | Começa em `1`. Incrementa a cada mudança incompatível em mensagens entre processos ou na rede (princípio VI). |

## ServerStatus

Estado do servidor de jogo visto pela interface.

| Campo | Tipo | Regra |
|-------|------|-------|
| `state` | `'starting' \| 'running' \| 'stopped'` | Ver transições abaixo. |
| `tick` | inteiro ≥ 0 | Ticks contados desde o início do loop. Nunca diminui enquanto `running`. |

**Transições** (controladas pelo processo principal, a partir do ciclo de vida do processo do
servidor):

```text
starting ──(primeiro status recebido do servidor)──▶ running
starting ──(processo encerra ou não responde)─────▶ stopped
running  ──(processo encerra)─────────────────────▶ stopped
```

`stopped` é terminal nesta feature (sem reinício automático). Ao entrar em `stopped`, `tick`
mantém o último valor recebido.

## ServerInfo

Resposta da chamada de exemplo (`getServerInfo`).

| Campo | Tipo | Origem | Regra |
|-------|------|--------|-------|
| `appVersion` | string semver | processo principal (versão do pacote `app`) | Não vazia. |
| `protocolVersion` | inteiro | servidor (`PROTOCOL_VERSION`) | Igual a `PROTOCOL_VERSION` da interface. |
| `serverStatus` | `ServerStatus` | servidor | `state` é `running` quando o servidor responde. |
| `tickRateHz` | inteiro | servidor | Sempre `20`. |
| `uptimeMs` | inteiro ≥ 0 | servidor | Tempo desde o início do loop. |

## ServerHostMessage

Mensagens entre o processo principal e o servidor (detalhes em
[contracts/server-host-protocol.md](./contracts/server-host-protocol.md)). União discriminada
pelo campo `type`, validada com type guard em `shared` nas duas pontas.

## ForbiddenFileRule

| Campo | Tipo | Regra |
|-------|------|-------|
| `id` | `'asset-dir' \| 'rom' \| 'ds-format' \| 'media-outside-art'` | Identifica a regra na mensagem. |
| `matches(path)` | função pura | Recebe caminho relativo com `/`; comparação sem diferenciar maiúsculas e minúsculas. |
| `reason` | string PT-BR | Explicação mostrada ao desenvolvedor, citando o princípio II. |

**ForbiddenFileViolation**: `{ path: string; ruleId: ForbiddenFileRule['id']; reason: string }`.
Um arquivo gera no máximo uma violação: a da primeira regra que casar, na ordem da tabela.
