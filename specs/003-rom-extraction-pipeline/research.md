# Research: Validação da ROM, desempacotamento e primeira execução

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-23

Cada item segue o formato Decisão / Motivo / Alternativas. Nenhum `NEEDS CLARIFICATION` ficou
aberto.

---

## R1. Identificação do jogo e da região pelo cabeçalho

**Decisão**: ler os primeiros 0x200 bytes da ROM e usar:

| Offset | Tam. | Campo | Uso |
|--------|------|-------|-----|
| 0x000 | 12 | título (ASCII) | só para a mensagem "outro jogo" (`POKEMON SS`, `POKEMON HG`) |
| 0x00C | 4 | código do jogo | 3 primeiras letras = jogo, 4ª = região |
| 0x15C | 2 | CRC do logo Nintendo | deve ser `0xCF56` |
| 0x15E | 2 | CRC16 do cabeçalho (0x000–0x15D) | deve conferir |

Códigos de jogo:

| Prefixo | Jogo |
|---------|------|
| `IPG` | Pokémon SoulSilver |
| `IPK` | Pokémon HeartGold |
| outro | outro jogo de DS |

Atenção: o "K" de HeartGold vem de *kin* (ouro) e o "G" de SoulSilver de *gin* (prata); é fácil
inverter. A região é a 4ª letra: `E` = EUA (o mesmo dump vale para Austrália), `J` = Japão,
`K` = Coreia, `P` = Europa (inglês), `F` = França, `D` = Alemanha, `I` = Itália, `S` = Espanha;
outras letras viram "região desconhecida".

CRC16 do cabeçalho: CRC-16/MODBUS (polinômio refletido `0xA001`, valor inicial `0xFFFF`), o
mesmo do BIOS do DS. Cabeçalho com CRC inválido ou CRC do logo diferente de `0xCF56` =
"não é uma ROM de DS".

**Motivo**: o cabeçalho permite uma recusa específica (HeartGold, região) mesmo quando o hash
não confere (FR-003, FR-004). Os dois CRCs separam "não é ROM" de "ROM corrompida" sem ler o
arquivo inteiro.

**Alternativas**: tabela de hashes de todas as versões e regiões (exige manter dezenas de
hashes e falha com qualquer dump diferente; o cabeçalho cobre todos os casos com uma tabela de
letras); só o hash (não diz *por que* o arquivo foi recusado).

## R2. Hash de referência da ROM

**Decisão**: SHA-1 do arquivo completo, comparado com uma lista de referências aceitas em
`packages/extractor/src/rom/reference.ts`. Valor inicial:

| Dump | SHA-1 |
|------|-------|
| Pokémon SoulSilver Version (USA, Australia), código `IPGE` | `f8dc38ea20c17541a43b58c5e6d18c1732c7e582` |

O valor vem do catálogo de dumps do TASVideos. Antes do merge, o desenvolvedor MUST confirmar
com o DAT do No-Intro e com a própria ROM (passo no [quickstart](./quickstart.md)). Se aparecer
outra revisão legítima, ela entra na lista.

A função de validação recebe a lista de referências como parâmetro (padrão = lista acima), para
os testes registrarem o hash da ROM sintética (FR-031).

**Motivo**: o No-Intro, referência de dumps limpos, publica SHA-1, o que permite conferir o valor
direto no DAT. O objetivo é identificar o dump, não resistir a ataque, então SHA-1 basta.

**Alternativas**: SHA-256 (não aparece em todos os catálogos, o que dificulta conferir); CRC32
(colisões fáceis demais para garantir que é o dump certo); hash só de partes da ROM (aceitaria
ROMs modificadas fora dessas partes).

## R3. Ordem das checagens e limites de tamanho

**Decisão**: a validação para na primeira checagem que falhar:

1. O caminho existe, é um arquivo e pode ser lido. Se não → `unreadable`.
2. Os primeiros bytes são assinatura de zip (`PK\x03\x04`), 7z (`7z\xBC\xAF\x27\x1C`) ou rar
   (`Rar!\x1A\x07`). Se sim → `archive`.
3. O tamanho está entre 32 KiB e 512 MiB, e o cabeçalho é válido (R1). Se não → `not-ds-rom`.
4. O prefixo do código é `IPK` → `heartgold`; outro que não `IPG` → `other-game`.
5. A região não é `E` → `other-region`.
6. O SHA-1 do arquivo completo não está na lista de referências → `modified`.
7. Caso contrário → aceito.

Os passos 1 a 5 leem no máximo 0x200 bytes; só o passo 6 lê o arquivo inteiro (128 MiB, menos de
1 s com stream).

**Motivo**: recusa arquivos grandes errados (vídeos, ISOs) sem calcular o hash, e garante a
mensagem mais específica possível (SC-002, SC-004).

**Alternativas**: calcular o hash primeiro (lento para arquivos grandes errados e menos
específico).

## R4. Formato do sistema de arquivos do DS

**Decisão**: o parser lê os campos do cabeçalho abaixo e extrai, sem conversão:

| Offset | Campo |
|--------|-------|
| 0x020 / 0x02C | offset / tamanho do ARM9 |
| 0x030 / 0x03C | offset / tamanho do ARM7 |
| 0x040 / 0x044 | offset / tamanho da FNT (tabela de nomes) |
| 0x048 / 0x04C | offset / tamanho da FAT (tabela de alocação) |
| 0x050 / 0x054 | offset / tamanho da tabela de overlays do ARM9 (y9) |
| 0x058 / 0x05C | offset / tamanho da tabela de overlays do ARM7 (y7) |
| 0x068 | offset do banner |

- **FAT**: 8 bytes por arquivo (`início`, `fim`, absolutos na ROM), indexada pelo id do arquivo.
- **FNT**: tabela principal com 8 bytes por diretório (`offset da subtabela`, `id do primeiro
  arquivo`, `id do pai` ou, na raiz, `total de diretórios`). Na subtabela, cada entrada começa
  com um byte `t`: `0x00` encerra; `0x01`–`0x7F` é arquivo com nome de `t` bytes; `0x81`–`0xFF`
  é diretório com nome de `t − 0x80` bytes, seguido do id do diretório (`0xF000 | n`, u16).
- **Overlays**: entradas de 32 bytes nas tabelas y9/y7; o campo `file id` (offset 0x18) aponta
  para a FAT. Os arquivos de overlay não aparecem na FNT.
- **Banner**: 0x840 bytes a partir do offset (versão 1, suficiente para HGSS).

Todo offset e tamanho passa por checagem de limites; violação gera `NdsFormatError` com o campo
e o valor.

**Motivo**: são os campos documentados (GBATEK) usados por ndstool e similares. As etapas
seguintes precisam de ARM9, overlays e do sistema de arquivos para achar tabelas de dados. A
descompressão (BLZ) do ARM9 e dos overlays é conversão e fica para os specs 4 a 9 (FR-015).

**Alternativas**: depender de ndstool ou de outro binário externo (fere "Node puro" e exige
distribuir executável); biblioteca npm de NDS (pouco mantidas, e o formato é pequeno o bastante
para implementar com testes).

## R5. Formato NARC e como detectá-lo

**Decisão**: é NARC todo arquivo do sistema de arquivos cujo conteúdo começa com `NARC`,
independentemente do nome (em HGSS, a maioria fica em `a/0/0/0` e similares, **sem extensão**).
Estrutura:

- Cabeçalho de 16 bytes: `NARC`, BOM `FE FF`, versão `0x0100`, tamanho total (u32), tamanho do
  cabeçalho `0x10` (u16), número de seções `3` (u16).
- `BTAF`: tamanho da seção (u32), número de arquivos (u16), reservado (u16), e então pares
  `início`/`fim` (u32) relativos ao início dos dados da `GMIF`.
- `BTNF`: tamanho da seção e uma FNT no mesmo formato da R4, com offsets relativos ao início da
  seção. A maioria dos NARCs de HGSS não tem nomes (só a raiz, com subtabela vazia).
- `GMIF`: tamanho da seção e os dados.

Membros são extraídos por índice. Se o `BTNF` tiver nomes, eles vão para um `names.json` ao
lado, mapeando índice → caminho. NARCs aninhados e membros comprimidos não são abertos (é
conversão).

**Motivo**: a detecção por assinatura é a única que funciona em HGSS. Extrair por índice preserva
a ordem (FR-014), que é como o jogo referencia os membros.

**Alternativas**: detecção pela extensão `.narc` (não funciona em HGSS); abrir recursivamente
NARCs aninhados (não há necessidade conhecida; YAGNI).

## R6. Layout da área de trabalho e saídas da etapa `rom-unpack`

**Decisão**: a área de trabalho é uma pasta raiz (no app, `%APPDATA%\SoulSilver Desktop\extraction`;
na CLI, `--out`). A etapa `rom-unpack` declara 3 saídas nomeadas:

| Saída | Caminho em `stages/rom-unpack/` | Conteúdo |
|-------|---------------------------------|----------|
| `binaries` | `binaries/` | `header.bin`, `arm9.bin`, `arm7.bin`, `banner.bin`, `y9.bin`, `y7.bin`, `overlay9/NNNN.bin`, `overlay7/NNNN.bin` |
| `filesystem` | `filesystem/` | árvore da FNT, bytes originais de cada arquivo, incluindo os NARCs inteiros |
| `narc` | `narc/` | para cada NARC em `filesystem/<caminho>`, a pasta `narc/<caminho>/` com `NNNN.bin` por membro (4 dígitos, mais se preciso) e, se houver, `names.json` |

Detalhes do layout completo em [data-model.md](./data-model.md#área-de-trabalho).

**Motivo**: separar os NARCs abertos da árvore original deixa claro para as próximas etapas o que
é bruto e o que é membro, e as saídas nomeadas permitem que cada etapa futura declare
exatamente o que consome. O espaço extra (os NARCs ficam duplicados) cabe no orçamento de
disco (R12).

**Alternativas**: substituir cada NARC pela pasta dele dentro de `filesystem/` (mistura arquivo
e pasta com o mesmo nome e quebra a correspondência com a FNT); uma saída única (as próximas
etapas não teriam como declarar dependências mais finas).

## R7. Atomicidade: staging, commit e manifesto incremental

**Decisão**:

1. Cada etapa grava em `staging/<stageId>-<aleatório>/`, na mesma unidade da área de trabalho.
2. Ao terminar, o runner calcula o digest de cada saída, apaga `stages/<stageId>/` antigo (se
   houver) e renomeia a pasta de staging para `stages/<stageId>/`.
3. Só então o runner grava o manifesto com a entrada da etapa.
4. Antes de rodar uma etapa que já existe no manifesto, o runner tira do manifesto a entrada
   dela e as das dependentes (gravação atômica) e só depois apaga as pastas.
5. O manifesto é gravado depois de **cada** etapa, não só no fim. "Pronto" = todas as etapas
   registradas no manifesto, na versão esperada (FR-018). Um manifesto incompleto continua
   válido para a retomada e nunca parece pronto.
6. Gravação atômica de arquivo: `<nome>.tmp-<aleatório>` → `fsync` → `rename` sobre o destino.
   No Windows, `rename` pode falhar com `EPERM`/`EBUSY` por causa de antivírus ou indexador: até
   5 tentativas com espera de 50 a 800 ms.
7. Na abertura do runner, sobras em `staging/` e pastas de `stages/` sem entrada no manifesto são
   apagadas.

Interrupção em qualquer ponto deixa: (a) manifesto antigo + pasta que será limpa, ou (b)
manifesto novo + pasta já no lugar. Nunca uma saída parcial listada como pronta (FR-012, FR-017,
SC-005).

**Motivo**: rename na mesma unidade NTFS é atômico para o observador, e o manifesto incremental
dá retomada por etapa sem estado extra.

**Alternativas**: marcador `.done` por etapa (é um segundo lugar de verdade que precisa ficar
coerente com o manifesto); gravar o manifesto só no fim (perderia a retomada por etapa); journal
ou banco (complexidade sem ganho).

## R8. Hash das saídas (digest de árvore)

**Decisão**: cada saída nomeada tem um digest SHA-256 de árvore: os arquivos são listados por
caminho relativo (separador `/`, ordenação por código de byte UTF-8) e cada um vira uma linha
`<caminho>\0<tamanho>\0<sha256 hex do conteúdo>\n`. O digest é o SHA-256 da concatenação. O
manifesto guarda, por saída, `sha256`, `files` e `bytes`.

**Motivo**: cumpre "hash de cada saída" sem listar dezenas de milhares de arquivos no manifesto
(HGSS tem centenas de NARCs e dezenas de milhares de membros). O digest é determinístico e igual
entre app e CLI (SC-008).

**Alternativas**: hash por arquivo no manifesto (manifesto de vários MB e leitura lenta na
abertura); hash só dos nomes e tamanhos (não detecta conteúdo corrompido).

## R9. Checagem rápida na abertura x verificação completa

**Decisão**: duas verificações na biblioteca:

- `checkAssets` (abertura do app, processo principal, assíncrona): manifesto existe e é válido;
  toda etapa registrada está no manifesto na versão esperada; a cópia da ROM existe e o tamanho
  bate; e, para cada saída, a pasta existe e a contagem recursiva de arquivos (`readdir`
  recursivo, sem `stat`) é igual a `files`. Meta: < 1 s com cache frio (SC-007), medida no
  quickstart.
- Verificação completa (recalcular o digest): roda quando o planner decide se pode pular uma
  etapa durante uma extração, e na CLI com `--verify`.

Isso substitui "existência e tamanho" da Assumption do spec por "existência e contagem de
arquivos"; a spec foi ajustada.

**Motivo**: `stat` em ~30 mil arquivos no Windows custa de 1 a 2 s; `readdir` recursivo custa uma
fração disso e já detecta arquivos apagados (US3, cenário 4). Corrupção de conteúdo é rara e é
pega na próxima extração ou com `--verify`.

**Alternativas**: verificação completa a cada abertura (de 2 a 5 s para ~400 MB, fere SC-007);
verificação completa em segundo plano depois da abertura (estado extra e reextração no meio do
jogo; YAGNI até existir jogo).

## R10. Onde a extração roda no app

**Decisão**: em um `utilityProcess` do Electron, `extractor-host`, criado por tarefa (validar e
copiar, ou extrair) e encerrado ao fim. Segue o padrão do `server-host` da 001: entry fino em
`packages/app/src/extractor-host/entry.ts`, mensagens tipadas com guardas em `shared`, e um
controlador puro e testado no processo principal (`assets-controller.ts`). O cancelamento envia
`cancel`, que vira `AbortSignal` na biblioteca; se o processo não sair em 5 s, ele é encerrado à
força, o que é seguro por causa da R7.

`checkAssets` (R9) roda no processo principal, porque é leve e assíncrona.

**Motivo**: o SHA-1 de 128 MiB e milhares de gravações bloqueariam o processo principal, e um
crash do extrator não derruba o app (FR-030; princípio IV, isolamento). É o mesmo padrão já
testado na 001.

**Alternativas**: `worker_threads` no processo principal (um crash nativo ou falta de memória
derruba o app); rodar no processo do servidor de jogo (fere o princípio IV: o tick não pode
disputar com I/O pesado).

## R11. CLI

**Decisão**: `packages/extractor/src/cli.ts`, executado com `node` direto (type stripping do
Node 24, como `scripts/`), com argumentos via `node:util` `parseArgs`. O extractor passa a usar
especificadores `.ts` nos imports (`allowImportingTsExtensions`; o pacote já é `noEmit` e o
bundler do app aceita). Script na raiz: `npm run extract -- --rom <arquivo> [...]`. A pasta de
saída padrão é `assets/` na raiz do repo, que já está no `.gitignore` e é bloqueada pelo hook de
pre-commit. Opções em [contracts/cli.md](./contracts/cli.md).

**Motivo**: nenhuma dependência nova nem etapa de build; o código é exatamente o mesmo da
biblioteca usada pelo app (FR-028).

**Alternativas**: `tsx` ou `ts-node` (dependência nova sem necessidade); commander ou yargs
(`parseArgs` basta).

## R12. Espaço em disco

**Decisão**: cada etapa declara `estimateBytes(romSize)`. Antes de rodar, o runner soma as
estimativas das etapas planejadas (+ tamanho da ROM se ainda for copiá-la, + 64 MiB de folga) e
compara com `fs.statfs(...).bavail * bsize`. Se faltar, falha com `disk-full` e
`requiredBytes`, sem gravar nada. `rom-unpack` estima `2,5 × romSize` (sistema de arquivos +
NARCs abertos + binários). Erros `ENOSPC`, `EACCES` ou `EPERM` durante a execução viram
`disk-full` ou `write-permission`.

**Motivo**: avisar antes de começar evita uma extração de vários minutos que falha no fim (edge
case "disco cheio"). `fs.statfs` é nativo do Node.

**Alternativas**: só reagir a `ENOSPC` (o jogador descobre tarde demais).

## R13. Log de extração

**Decisão**: arquivo de texto UTF-8 `logs/extractor.log` na pasta de dados do usuário, uma linha
por evento: `ISO-8601 NÍVEL [stageId] mensagem`. A primeira linha de cada execução registra a
versão do app, as versões das etapas, o SO e o hash da ROM (só o hash). Erros incluem `code` e
stack. Rotação: ao passar de 1 MiB, vira `extractor.1.log` (um backup). A biblioteca recebe uma
interface `Logger`. O app usa o logger de arquivo; a CLI escreve no stderr e, com `--log`, num
arquivo. "Abrir log" usa `shell.showItemInFolder`. Nenhum buffer é passado ao logger (FR-027).

**Motivo**: texto simples é fácil de anexar numa conversa, e um backup de 1 MiB guarda contexto
suficiente sem crescer sem limite.

**Alternativas**: JSON lines (menos legível para o jogador); biblioteca de log como pino ou
winston (dependência sem necessidade).

## R14. Uma extração por vez

**Decisão**: arquivo `extraction/.lock` criado com flag `wx` e contendo `{ pid, startedAt }`. Se já
existir e o pid não estiver vivo (`process.kill(pid, 0)` lança `ESRCH`), o lock é considerado
abandonado e substituído. Se estiver vivo → erro `busy`. O app já tem instância única
(`requestSingleInstanceLock`, da 002); o lock cobre app + CLI na mesma pasta.

**Motivo**: é simples e cobre o edge case "duas instâncias".

**Alternativas**: biblioteca `proper-lockfile` (dependência para um caso raro).

## R15. Validação do manifesto (princípio III)

**Decisão**: guarda escrita à mão (`parseManifest(json) → { ok, manifest } | { ok: false, path,
problem }`), no mesmo estilo de `server-host-protocol.ts`. `formatVersion` desconhecido ou
inválido = ausente (FR-019), com aviso no log (campo e problema).

**Motivo**: o schema é pequeno; ainda não há outro arquivo de dados que justifique uma biblioteca
de schema. Quando os specs 4 a 9 trouxerem schemas maiores, a escolha de uma biblioteca será
decidida lá.

**Alternativas**: zod ou valibot agora (dependência antes da necessidade real; YAGNI).

## R16. Progresso

**Decisão**: cada etapa declara `weight` (custo relativo). Porcentagem total = (soma dos pesos das
etapas planejadas já concluídas + peso da atual × fração reportada) ÷ soma dos pesos planejados,
arredondada para baixo e nunca decrescente. A validação e a cópia da ROM entram como pseudo-etapas
com peso próprio na primeira execução. O extractor-host envia no máximo 10 mensagens de
progresso por segundo, e sempre a de 100 %.

**Motivo**: atende FR-020 (≥ 1 atualização/s enquanto há avanço) sem inundar o IPC.

**Alternativas**: porcentagem por contagem de etapas (salta de 0 a 100 enquanto só existe uma
etapa).

## R17. Arrastar e soltar com sandbox

**Decisão**: o renderer recebe o `File` do evento `drop` e chama `window.soulSilver.submitRomFile(file)`;
o preload converte com `webUtils.getPathForFile(file)` e envia só o caminho ao processo
principal. O seletor usa `dialog.showOpenDialog` no principal, com filtro `*.nds` e opção "Todos
os arquivos" (para que arquivos errados também cheguem à validação e recebam mensagem
específica).

**Motivo**: com `sandbox`, `File.path` não existe; `webUtils` é a API oficial. O caminho só é
lido para validação, e o principal ignora pedidos fora dos estados que aceitam ROM.

**Alternativas**: ler o arquivo no renderer e mandar os bytes (128 MiB por IPC, e o renderer
passaria a manipular a ROM).

## R18. Estratégia de testes

**Decisão** (princípio V, test-first):

- **Builders sintéticos** em `packages/extractor/test/fixtures/`: `buildNarc(members, names?)` e
  `buildNdsRom({ gameCode, title, files, overlays, ... })`, que calculam CRCs e offsets. Para
  arquivos "corrompidos", os testes alteram bytes de propósito.
- **Validação**: um teste por motivo de recusa, com a lista de referências recebendo o SHA-1 da
  ROM sintética.
- **Pipeline**: etapas falsas em memória para o registro (duplicadas, ciclos, dependências
  ausentes), o planner (tabela de cenários) e o runner.
- **Interrupção (SC-005)**: o runner aceita um hook de teste `onCheckpoint(name)` chamado nos
  pontos críticos (antes e depois do staging, do rename e da gravação do manifesto). O teste
  "derruba" o run lançando uma exceção nesse hook em cada um dos ≥ 10 pontos, sem cleanup, roda
  de novo e confere que termina pronto e com digests corretos.
- **Atualização (SC-006)**: duas listas de etapas com uma versão diferente; confere quais rodaram.
- **App**: `assets-controller` com extractor-host e sistema de arquivos falsos. A tela é
  verificada manualmente (quickstart).
- **Paridade (SC-008)**: a mesma ROM sintética rodada pela API do runner e pela função `main` da
  CLI dá manifestos iguais, exceto pelas datas.

**Motivo**: cobre todos os critérios de sucesso sem ROM real (princípio II).
