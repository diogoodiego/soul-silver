# Research: Servidor de jogo e protocolo

## R1. Transporte nesta feature

- **Decision**: interface `Connection { send(msg), onMessage(cb), onClose(cb), close(reason) }`. Implementações: em memória (testes) e local via IPC (renderer → preload → main → `utilityProcess` do servidor). WebSocket para outros PCs fica na feature 12, sobre a mesma interface.
- **Rationale**: o renderer não pode abrir rede direto (princípio IX); o processo do servidor já existe (`server-host.ts`). Rede LAN está fora do escopo.
- **Alternatives**: WebSocket já agora em localhost — antecipa trabalho da 12 e esbarra no princípio IX.

## R2. Validação de mensagens

- **Decision**: schemas `zod` em `shared/src/game/protocol.ts`, união discriminada por `type`; `safeParse` na chegada nos dois lados; falha → descarta + log com id da conexão e tipo.
- **Rationale**: `zod` já é dependência do `shared` e usado nos schemas de dados.
- **Alternatives**: guards manuais como em `server-host-protocol.ts` — verbosos demais para ~10 mensagens.

## R3. Estado incremental

- **Decision**: por cliente, o servidor guarda o último estado enviado de cada entidade visível. A cada tick envia `state` com: entidades novas (completas), campos alterados das existentes e ids removidos. Primeira mensagem e troca de área enviam o conjunto completo. Sem ack.
- **Rationale**: IPC e WebSocket são confiáveis e ordenados, então o delta contra o último enviado nunca perde base. Elimina buffer de snapshots e acks.
- **Alternatives**: delta contra último estado confirmado (estilo Quake/UDP) — necessário só em transporte sem garantia.

## R4. Previsão e reconciliação

- **Decision**: o cliente aplica cada input localmente com a mesma `stepMovement` do servidor e guarda os não confirmados. Ao receber `state` com `lastInput`, descarta os confirmados, parte da posição do servidor e reaplica os pendentes. A diferença entre posição exibida e corrigida decai em ~100 ms; acima de 2 tiles, aplica direto.
- **Rationale**: padrão clássico (Gambetta); função compartilhada torna a divergência rara.
- **Alternatives**: esperar o servidor — viola SC-003.

## R5. Interpolação de remotos

- **Decision**: buffer de estados com o tick do servidor; o cliente exibe remotos 100 ms (2 ticks) no passado, interpolando linearmente; sem dados novos, segura a última posição (sem extrapolar).
- **Rationale**: simples e suave com jitter moderado (SC-006).

## R6. Inputs

- **Decision**: o cliente envia um input por tick de simulação local (`seq` crescente, direção + botões). O servidor enfileira por jogador e consome **um** por tick; duplicados/antigos (`seq ≤ último`) são ignorados; fila acima de 10 descarta os mais antigos e registra. Sem input no tick: jogador parado.
- **Rationale**: uma taxa fixa torna a previsão igual à simulação e limita abuso.

## R7. Movimento

- **Decision**: posição contínua em pixels, velocidade fixa por tick, colisão contra a grade da feature 006 (`CollisionCell`), tratada eixo a eixo. Mudança de área por bordas/warps fica para specs futuras; aqui a área é atribuída na entrada.
- **Rationale**: combate em tempo real pede movimento livre (princípio I: mecânica livre).

## R8. RNG e determinismo

- **Decision**: `sfc32` com semente de 32 bits em `shared/src/game/rng.ts`; um gerador por sessão; proibido `Math.random`/`Date.now` dentro da simulação (teste de grep).
- **Rationale**: ~10 linhas, rápido, reproduzível.

## R9. Gravação e replay

- **Decision**: gravação = `{ protocolVersion, seed, events: [{ tick, kind: "join"|"leave"|"input", playerId, input? }] }`. Replay cria a sessão sem conexões e injeta os eventos por tick, avançando ticks manualmente. Comparação: hash do estado do mundo serializado de forma estável.
- **Rationale**: entradas e saídas mudam o mundo, então entram na gravação; nada de clock real.

## R10. Métricas de tick e painel

- **Decision**: o tick loop mede a duração com `performance.now()`; `tick-metrics` mantém último/média/pior nos últimos 100 ticks. Vão no `status` host↔servidor já existente e para os clientes na mensagem `debug` (1×/s). O painel é um overlay simples no client (Svelte), ligado por tecla.
- **Rationale**: reusa o canal de status; render de verdade é a feature 11.

## R11. Ciclo de vida

- **Decision**: estados `open → closed`. Entrada recusada se cheia (4), versão diferente ou sessão fechada. Saída: mensagem `leave`, conexão fechada ou 10 s sem mensagens. Encerra quando o host sai, quando o último sai ou por ordem do host. Ao encerrar, envia `session-closed` com motivo a todos.
