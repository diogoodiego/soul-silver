# Pesquisa: Áudio

**Feature**: [spec.md](./spec.md) | **Plano**: [plan.md](./plan.md)

Este documento resolve as decisões do plano. O R0 foi iniciado antes do plano (contagens e
estrutura do arquivo de som); o que ainda depende de verificação aponta para o R0 que roda antes
da implementação, como nas features 006 a 008.

## R0. Verificação do arquivo de som na ROM (concluída)

**Decisão**: antes do código de produção, uma sonda (`audio/probe.ts`, só contagens, tamanhos e
magias, nunca bytes da ROM) confirma o que falta abaixo na ROM real do desenvolvedor.

**Rationale**: a decisão do R1 e o desenho do sintetizador dependem do conteúdo do arquivo; errar o
mapeamento de um cry ou o tamanho de um comando de sequência não dá erro, dá som errado.

### Achados (conferidos na ROM real; só contagens e estrutura)

Arquivo: `data/sound/gs_sound_data.sdat` na saída `filesystem` da 003 (8 660 096 bytes). Existe também
`pbr/sound_data.sdat`, do Pokémon Battle Revolution; não faz parte do jogo e fica de fora.

| Item | Valor |
|------|-------|
| Contêiner | `SDAT`, versão 1.0, 4 blocos: `SYMB` (nomes), `INFO` (registros), `FAT` (2 353 arquivos), `FILE` |
| Sequências (`SSEQ`) | 2 379 entradas no `INFO`, 1 372 com registro: 1 006 efeitos `SEQ_SE_*`, 319 `SEQ_GS_*` (músicas), 33 `SEQ_ME_*` (jingles), alguns `SEQ_PL_*`, `SEQ_AIF_*`, `SEQ_BGM`, e 3 de cry (`SEQ_PV001`, `SEQ_PV`, `SEQ_PV_END`) |
| Bancos (`SBNK`) | 778 entradas, 561 com registro; cada banco aponta para até 4 arquivos de ondas |
| Ondas (`SWAR`) | 778 entradas |
| Players, grupos | 9 players, 17 grupos; sem fluxos (`STRM`) e sem `SEQARC` |
| Nomes | O `SYMB` nomeia sequências, bancos e ondas (`SEQ_GS_TITLE`, `BANK_PV001`, `WAVE_ARC_PV001`...). Os nomes saem estáveis |
| Sequências em disco | 1,9 MB no total (maior: 33 924 bytes); as ondas somam cerca de 6,6 MB |

- **Identificadores**: o índice da sequência no `INFO` é o id de música e de efeito que o jogo usa
  (`SEQ_DUMMY` = 1000, `SEQ_GS_TITLE` = 1004, `SEQ_SE_END` = 2378; os cabeçalhos de mapa da 006 têm
  `musicDay` e `musicNight` nessa faixa).
- **Cries**: a sequência `SEQ_PV` é genérica (andamento 100, instrumento 0, volume 127, centro, uma
  nota 60 de velocidade 127 e duração 0, fim). O som do Pokémon vem do banco `BANK_PVnnn` e da
  onda `WAVE_ARC_PVnnn`; o cry é essa nota tocada com o banco da espécie. 493 bancos têm nome
  `BANK_PV…`, mais `BANK_PV516_SKY` e 67 bancos de música e efeitos.
- **Mapeamento dos cries (confirmado no código do jogo)**: `PlayCry` (rotina do ARM9, lida na decomp
  pública `pret/pokeheartgold`, `asm/unk_02005D10.s`) toca a sequência `SEQ_PV` com o banco de
  índice igual à espécie. A única forma com banco próprio é Shaymin Céu (espécie 492, forma 1 →
  banco 494, `BANK_PV516_SKY`); Chatot (441) usa o grito gravado pelo jogador quando existe, senão o
  banco normal. Os nomes `BANK_PVnnn` de 387 em diante vêm de outra numeração e não importam: o
  jogo usa o índice. Resultado: 493 cries mais 1 forma.
- **Estimativa de duração** (andador de sequências simplificado, só intro mais uma volta do loop,
  em 235 das 358 músicas e jingles que ele leu até o fim): mediana de 19 s, percentil 90 de 60 s, máximo de
  147 s. Os efeitos têm mediana de 0,8 s e soma de cerca de 1 400 s. Somando as músicas que o
  andador não leu até o fim, a estimativa é de 10 000 a 15 000 s de música, 1 500 s de efeitos e
  cerca de 600 s de cries.
- **Ainda não lido pelo andador**: comandos com prefixo aleatório ou de variável (`0xA0` a `0xA2`),
  operações de variável (`0xB0` a `0xBD`) e alguns comandos acima de `0xE3`. O intérprete real do
  plano trata todos.

### Resolvido pela sonda e pela etapa (`audio/probe.ts`)

- **Comandos de sequência**: as 1 372 sequências leem até o fim, sem comando desconhecido. Aparecem
  notas, pausa, instrumento, abrir faixa, salto, chamada e retorno, `0xB0` (variável, 112 vezes),
  pan, volume, transposição, bend e alcance, prioridade, espera de nota, modulação (LFO),
  portamento (7 vezes), laço com contagem (7), expressão, atraso da modulação, andamento,
  varredura de altura, alocação de faixas e fim. **Não aparecem** os prefixos aleatório,
  variável e condicional (`0xA0` a `0xA2`), ligadura (`0xC8`), volume principal (`0xC2`) nem os
  comandos de envelope por faixa (`0xD0` a `0xD3`); o intérprete os trata mesmo assim.
- **Instrumentos**: 2 407 simples, 2 588 divisões por tecla, 137 conjuntos de percussão; notas PCM
  20 721, onda quadrada 706, ruído 179. **Ondas**: 1 102, 376 com loop.
- **Música, jingle e efeito**: pelo prefixo do nome. Os ids que os 540 cabeçalhos de mapa pedem
  (`musicDay`, `musicNight`) e os que os scripts da 008 tocam (`PlayBGM`, `PlaySE`, `PlayFanfare`,
  `TempBGM`, `PlayCry`) têm todos uma faixa (relatório: nenhum faltando).
- **Marcadores**: `SEQ_BGM_END` e `SEQ_SE_END` (como `SEQ_PV_END`) marcam o fim das listas e são uma
  nota presa num instrumento com loop; não são faixas e ficam de fora.
- **Durações e tamanho reais**: 329 músicas somam 14 005 s (introdução mais uma volta; 313 com
  loop), mais 33 jingles, 1 004 efeitos e 494 cries. Total: **399 MB** (músicas 349 MB, efeitos
  40 MB, jingles 3,4 MB, cries 6,7 MB). O andador simplificado subestimava as durações porque não
  contava a espera das notas.
- **Volume**: 6 das 362 músicas e jingles tocam o teto em no máximo 0,001% das amostras, como o
  misturador do DS, que também satura.
- **Não convertido**: `SEQ_SE_GS_STADIUM_KANSEI` (torcida do estádio) é uma nota de 912 s seguida de
  um salto; o jogo a interrompe antes. Com o limite de 600 s ela não termina nem repete e fica no
  relatório (1 de 1 367 faixas, dentro do limite de 2%).

**Saída**: seção de descobertas neste arquivo (contagens, offsets relativos; sem bytes da ROM).

## R1. Pré-renderizar ou tocar as sequências em tempo real

**Decisão**: **pré-renderizar**. A etapa roda um emulador do motor de som do DS no Node e grava um
áudio por faixa; o jogo só decodifica e toca esse áudio.

| Critério | A. WAV PCM pré-renderizado | B. Pré-renderizado, ADPCM (escolhida) | C. Sequências em tempo real no jogo |
|----------|----------------------------|---------------------------------------|-------------------------------------|
| Fidelidade | Igual ao emulador do motor | Igual, com ruído de quantização do ADPCM, inaudível na comparação lado a lado esperada | Igual ao emulador, se o emulador rodar também no jogo |
| Disco (estimativa) | 1 GB (mono) a 2 GB (estéreo): estoura a meta | 0,4 a 0,6 GB estéreo, menos com mono | Cerca de 10 MB |
| Complexidade no extrator | Emulador + gravação WAV | Emulador + codificador ADPCM (poucas dezenas de linhas) | Só conversão dos arquivos |
| Complexidade no jogo | Mínima (decodificar e tocar) | Mínima (decodificador ADPCM pequeno) | Emulador completo num AudioWorklet, testado só no navegador |
| Testes (princípio V) | Determinísticos em Node | Determinísticos em Node | O sintetizador em tempo real é difícil de testar |
| Loop sem corte | Verificável em amostras | Verificável em amostras | Depende da pontualidade do worklet |
| Transições e mixagem (feature 26) | Simples (buffers) | Simples (buffers) | Mais flexível, mais trabalho |

**Rationale**: o emulador é necessário nas duas famílias; pré-renderizar o mantém no extrator, onde é
testável em Node puro e roda uma vez, e deixa o jogo (feature 26) com a tarefa simples de tocar
buffers com loop exato. A opção C só ganha em disco, e a meta de 1 GB é atendida com ADPCM. Se a
estimativa de tamanho do R0 sair pior que a esperada, o plano reduz a taxa de amostragem ou grava
mono quando os dois canais forem idênticos antes de mudar de opção.

**Alternativas**: codificação com perdas (Vorbis ou Opus) rejeitada por exigir um codificador
nativo ou WASM (dependência pesada, princípio X) para ganhar disco que a meta não exige.

## R2. Emulador do motor de som

**Decisão**: emulador próprio em TypeScript, sem dependência, escrito a partir da documentação
pública do motor Nitro e conferido contra a ROM. Escopo, em ordem de entrega:

1. Leitura do contêiner (`SDAT`, `SYMB`, `INFO`, `FAT`) e dos arquivos `SSEQ`, `SBNK` e `SWAR`.
2. Decodificação de ondas (PCM de 8 e 16 bits, IMA ADPCM) com loop.
3. Intérprete de sequência: faixas, notas, pausas, instrumento, volume, expressão, pan,
   transposição, bend e alcance, prioridade, mono e poli, ligadura, portamento, modulação
   (LFO), envelope (ataque, decaimento, sustentação e soltura), andamento, laços, chamadas e
   retornos, saltos, variáveis e comandos condicionais e aleatórios.
4. Canais: PCM com interpolação e envelope, onda quadrada (ciclos de trabalho de 1/8 a 7/8) e
   ruído, polifonia de 16 canais com a regra de prioridade e roubo do motor.
5. Mixagem estéreo a 32 kHz com pan e a curva de volume do motor.

**Rationale**: a fidelidade vem de seguir o motor, não de aproximar. As tabelas de conversão
(ataque, decaimento, sustentação, volume em decibéis, pan) ficam em `audio/tables.ts` como dados
documentados, e cada uma tem teste com valores conhecidos.

**Alternativas**: biblioteca de terceiros ou ferramenta externa (rejeitadas: dependência sem
garantia de determinismo, e o plano exige áudio gerado só a partir da ROM do jogador).

**Como ficou na implementação** (cada ponto é uma aproximação consciente, conferível por escuta):

- Volumes em centibéis pelas fórmulas que as tabelas do motor arredondam (curva ao quadrado para
  velocidade, volume, expressão e volume da sequência), e ganho final `10^(cB/200)`; pan linear.
- Envelope, ataque, decaimento, sustentação e soltura com as regras do motor, atualizados a cada
  quadro (cerca de 192 por segundo), com o andamento dando um tique a cada 240 unidades.
- Interpolação linear das ondas PCM (o DS não interpola); onda quadrada e ruído a 440 Hz na nota
  base; escala da modulação e do portamento aproximada.
- Ligadura (`0xC8`) é lida e ignorada: nenhuma sequência da ROM a usa.
- Variáveis começam em -1 e o gerador aleatório tem semente fixa, então a saída é determinística.

**Risco**: a fidelidade só se confirma por escuta; os testes sintéticos provam as tabelas, o tom e
as transições, não o timbre final. A conferência manual do SC-001 é o critério.

## R3. Loop e introdução

**Decisão**: o intérprete detecta o laço infinito da sequência (salto para trás ou laço sem fim) e o
ponto onde ele volta; o render grava a introdução e **uma volta do loop tirada da segunda
passada**, de modo que a cauda das notas que passam do fim do loop esteja no começo da volta, como
no jogo. O índice guarda `loop: { start, end }` em amostras. A emenda é verificada por teste (a
diferença entre a última e a primeira amostra do loop fica abaixo de um limite, e o espectro
dos 10 ms de cada lado não salta). Faixa sem laço infinito é gravada inteira e sem loop.

**Rationale**: é o método padrão para capturar loops de música sintetizada e atende o FR-006 e o
FR-007 sem repetir o trecho no disco.

**Efeito conhecido**: na primeira entrada no loop a cauda das últimas notas da introdução é a da
introdução, não a da volta; é uma diferença de décimos de segundo, que a escuta lado a lado deve
confirmar como inaudível (SC-002).

## R4. Codificação e contêiner

**Decisão**: arquivos WAV com IMA ADPCM (formato 0x11) a 32 000 Hz, estéreo; mono quando os dois
canais saem idênticos (comum em efeitos e cries). O codificador e o decodificador de ADPCM têm cerca
de 60 linhas cada e teste de ida e volta. O jogo e a página de desenvolvimento decodificam o ADPCM
em JavaScript puro para um `AudioBuffer`; qualquer ferramenta comum também toca o WAV para a
comparação lado a lado.

**Rationale**: 4:1 sobre PCM sem dependência, formato aberto e tocável fora do projeto.

**Alternativas**: WAV PCM (rejeitado, tamanho); formato próprio (rejeitado, perde as ferramentas).

## R5. Identificação

**Decisão**: o id da faixa é o índice da sequência no `INFO`; o nome vem do `SYMB`. O tipo vem do
prefixo do nome: `SEQ_ME_*` jingle, `SEQ_SE_*` efeito, `SEQ_GS_*`, `SEQ_PL_*`, `SEQ_AIF_*` e
`SEQ_BGM` música. A etapa cruza os ids com `musicDay` e `musicNight` dos cabeçalhos de mapa (006) e
com os comandos de tocar música, efeito e cry dos scripts (008) e lista no relatório os que não têm
faixa. Os cries são identificados por espécie e forma pelo mapeamento do R0.

## R6. Cries

**Decisão**: cada cry é a sequência genérica `SEQ_PV` tocada com o banco da espécie (ou forma), pelo
mesmo emulador. O cry é curto e quase sempre mono; entra no índice com `species` e `form`.
Uma forma sem cry próprio usa o da forma base, e o relatório a lista.

## R7. Paralelismo e determinismo

**Decisão**: o render de cada faixa é independente; a etapa distribui as faixas por
`node:worker_threads` (biblioteca padrão), um trabalhador por núcleo. A ordem de gravação e o índice
seguem o id, e o render não depende de relógio nem de ordem de execução, então a saída é idêntica
byte a byte (SC-005). A meta é terminar em menos de 10 minutos em 4 núcleos; o relatório mostra o
tempo.

## R8. Reprodutor de desenvolvimento

**Decisão**: `viewer/audio.html`, servida pelo servidor local do visualizador de mapas
(`npm run audio:view`), somente leitura em `127.0.0.1`. Lista as faixas por tipo, toca a escolhida
decodificando o ADPCM, marca o loop e repete o loop depois da introdução. Fica em
`extractor/src/viewer/`, que não entra no app.

## R9. Testes

**Decisão**: builders sintéticos de `SDAT` (uma sequência, um banco e uma onda de poucas amostras),
`SSEQ` com cada comando, `SWAV` PCM8, PCM16 e ADPCM. Casos principais: tom correto (frequência de
uma onda conhecida), tempo da nota, envelope (ataque, decaimento, sustentação, soltura), pan e
volume, laço com e sem fim, emenda do loop, prioridade de canais, codificador ADPCM de ida e volta,
saída idêntica em duas execuções, erro com banco ausente. A conferência com a ROM real (4 faixas lado
a lado, 10 loops, 493 cries) é manual e separada da integração contínua.

## R10. Falhas parciais e relatório

**Decisão**: o relatório tem contagens por tipo, tamanho total e por tipo, as faixas não
convertidas com o motivo, os ids de mapa e script sem faixa, os cries resolvidos pela forma base e o
tempo de render. A etapa falha se algum dos 493 cries se perder ou se mais de 2% das demais faixas se
perderem (valor inicial, revisto com os números reais do R0).

## R11. Ordem de entrega

**Decisão**: cries primeiro (uma nota, o menor caminho que passa pelo contêiner, o banco, a onda, o
envelope e a gravação), depois efeitos (sequências curtas), depois música com loop, por último o
relatório e o reprodutor. A ordem reduz o risco do emulador; a prioridade de produto continua a
da spec.
