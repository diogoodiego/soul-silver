# Research: LAN, sessões e saves

## R1. Transporte para convidados

- **Decision**: servidor WebSocket com `ws` dentro do `utilityProcess` do servidor, só quando
  hospedado, em `0.0.0.0:47800` (porta configurável por fallback +1..+9 se ocupada). O convidado
  conecta pelo main (cliente `ws`) e repassa ao renderer pelos canais `game:*` já existentes.
- **Rationale**: a feature 010 já define `Connection` e deixou o WebSocket para cá; o servidor
  atende conexões locais (IPC) e remotas (WS) pela mesma interface. O renderer não abre rede
  (princípio IX).
- **Alternatives**: WebSocket nativo do Node 22 é só cliente; escrever um servidor WS à mão é código
  de protocolo sem ganho. TCP cru exigiria framing próprio.

## R2. Descoberta na LAN

- **Decision**: broadcast UDP (`node:dgram`) em `255.255.255.255` e no broadcast de cada interface
  IPv4 não interna, porta `47801`, a cada 1 s; listagem expira entradas após 4 s sem anúncio.
  Pacote JSON pequeno validado por zod (`contracts/lan-discovery.md`).
- **Rationale**: 1 s de intervalo dá folga para os 5 s do SC-001; sem dependência; o broadcast por
  interface cobre PCs com vários adaptadores.
- **Alternatives**: mDNS/Bonjour (dependência, comportamento instável no Windows); multicast (alguns
  roteadores domésticos bloqueiam por IGMP).

## R3. Aviso de firewall

- **Decision**: na primeira vez que o jogador escolhe Hospedar, mostrar `FirewallNotice` antes de
  abrir o socket; gravar `firewallNoticeSeen` em `userData/settings.json`. O aviso do Windows aparece
  ao chamar `listen`, ou seja, depois da explicação.
- **Rationale**: o Windows mostra o prompt ao primeiro bind de entrada do executável; não há API
  para antecipar sem privilégio de admin.
- **Alternatives**: criar a regra no instalador (exige elevação e quebra no auto-update).

## R4. Formato e gravação do save

- **Decision**: JSON UTF-8 `slot-N.json`; gravação = escrever `slot-N.json.tmp-<rand>` + `fsync` +
  copiar o atual para `.bak` (rename do atual → `.bak`, depois rename tmp → atual), com retry de
  rename como em `extractor/src/fs-atomic.ts` (antivírus no Windows). Corrupção = JSON inválido ou
  falha no schema após migração.
- **Rationale**: rename no mesmo volume é atômico no NTFS; o `.bak` sempre é o último save íntegro.
- **Alternatives**: checksum embutido (o schema já pega truncamento e edição grosseira); SQLite
  (exagero para 3 arquivos).
- **Nota**: `renameWithRetry` vive no extractor; mover para `app` reaproveitando o mesmo código
  seria acoplamento errado — copiar a função (~20 linhas) para `app/src/main/save-store.ts` ou
  extrair para `shared/node` é decisão do tasks; preferir reaproveitar se o import não puxar o
  extractor inteiro.

## R5. Migração

- **Decision**: `migrations: Record<number, (save) => save>` em `shared/save/migrate.ts`; `migrate`
  aplica `n → n+1` até `SAVE_SCHEMA_VERSION`; versão maior que a atual → erro `save-too-new`.
  Testado com uma migração fictícia injetada no teste (registro passado como parâmetro).
- **Rationale**: atende o princípio VI sem migração real ainda.

## R6. Validação no host

- **Decision**: `hello` leva o save; o servidor roda `migrate` + `saveSchema.parse` + `checkCoherence`
  (mapa existe no mundo carregado, posição dentro do mapa, nível 1–100 quando houver, contagens ≥ 0,
  tempo de jogo ≥ 0). Falha → `reject` com código `invalid-save` e mensagem com o campo e o motivo.
  Faixas como nível 1–100 já ficam no schema; coerência cobre o que depende do mundo.
- **Rationale**: o schema compartilhado garante a mesma regra em cliente e host.

## R7. Save devolvido pelo servidor

- **Decision**: mensagem `save` com o save completo do jogador: a cada 30 s de jogo (600 ticks), em
  cada warp, e no `leave`/fim de sessão. O cliente grava e responde `save-ack` com o `rev`.
  No fim de sessão o servidor espera os acks por até 3 s antes de mandar `session-closed`.
- **Rationale**: 30 s fica abaixo do limite de 60 s do FR-006; save é pequeno.

## R8. Queda e reconexão

- **Decision**: ao cair (timeout ou close sem `leave`), o jogador vira "reservado" por 2 min com a
  entidade removida do mundo e o último estado guardado; o `welcome` traz um `resumeToken`
  aleatório; o `hello` com o mesmo nome + `resumeToken` válido retoma o estado do servidor (não o
  save do cliente). Nome de um reservado sem token → recusado como `name-taken`.
- **Rationale**: o estado do servidor é o mais novo; o token impede que outro PC "roube" o lugar.
- **Alternatives**: confiar no save do cliente na volta (perderia até 30 s de progresso).

## R9. Sessão solo isolada

- **Decision**: solo não abre WebSocket nem anuncia; o único caminho de entrada é o IPC local.
- **Rationale**: atende FR-012 e SC-007 por construção, sem regra de filtro.

## R10. Nome único

- **Decision**: comparação `name.trim().toLocaleLowerCase("en")` entre conectados e reservados.
