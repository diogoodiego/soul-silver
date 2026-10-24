# Feature Specification: Áudio

**Feature Branch**: `009-audio-extraction`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "Áudio: etapa do extrator que converte o arquivo de som da ROM (SDAT: sequências, bancos de instrumentos e amostras) em música, efeitos sonoros e cries utilizáveis pelo jogo."

## Contexto

A trilha sonora, os efeitos e os gritos dos Pokémon vêm da ROM do jogador (princípios I e II). No DS
a música não é um arquivo de áudio pronto: são sequências de notas tocadas por um sintetizador
com instrumentos e amostras próprios, guardadas num único arquivo de som. Sem converter esse
arquivo não há trilha sonora, e acertar o som é o segundo maior risco técnico do Marco 1.

Esta feature acrescenta uma etapa ao pipeline de extração (features 003 a 008). Ela converte o
arquivo de som da ROM em áudio que o jogo consegue tocar, e liga cada faixa ao identificador que os
headers de mapa (feature 006) e os scripts (feature 008) já usam. Tocar o áudio durante o jogo, a
mixagem e o volume ficam para a feature 26.

Atores:

- **Jogador**: ouve a música do lugar onde está, em loop, durante o jogo (feature 26 toca; esta feature entrega).
- **Desenvolvedor do jogo**: precisa dos efeitos sonoros e dos gritos (cries) dos 493 Pokémon, achados por nome ou número, e da faixa de cada mapa.
- **Desenvolvedor (conferência)**: ouve qualquer faixa e compara com o jogo original.

Termos:

- **Faixa**: uma música, um efeito sonoro ou um cry, com identificador próprio.
- **Sequência**: a partitura de uma faixa (notas, tempos, instrumentos) tocada por um sintetizador.
- **Banco de instrumentos** e **amostra**: os timbres e os sons gravados que a sequência usa.
- **Introdução e loop**: uma faixa pode tocar um trecho inicial uma só vez e depois repetir um trecho para sempre; os **pontos de loop** marcam onde o loop começa e termina.
- **Cry**: o grito de um Pokémon, um por espécie (e por forma, quando o original distingue).
- **Relatório de áudio**: resumo gerado ao fim da etapa, com contagens por tipo, faixas faltando e o tamanho total.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Música de cada lugar, em loop sem corte (Priority: P1)

O jogador (e o desenvolvedor que monta o mapa) recebe a música original de cada lugar do jogo,
associada ao identificador que o header do mapa usa para o dia e para a noite. Uma faixa com
introdução toca a introdução uma vez e depois repete o loop, sem corte perceptível na volta.

**Why this priority**: sem música o jogo perde metade da identidade. É também o maior risco técnico
da feature: a conversão precisa soar como o original.

**Independent Test**: com sequências e amostras sintéticas, extrair uma faixa com introdução e
loop e conferir os pontos de loop e a continuidade do som na volta; com a ROM real, comparar lado a
lado as faixas de New Bark Town, da Route 29, da batalha selvagem e do Centro Pokémon com o jogo
original.

**Acceptance Scenarios**:

1. **Given** a ROM extraída, **When** o desenvolvedor consulta o identificador de música de um mapa, **Then** recebe a faixa correspondente, pronta para tocar.
2. **Given** uma faixa com introdução e loop, **When** ela toca do início, **Then** a introdução toca uma vez e o loop repete sem a introdução.
3. **Given** uma faixa que repete, **When** o loop volta ao começo, **Then** não há silêncio, estalo nem salto audível na emenda.
4. **Given** uma faixa sem loop (como um jingle), **When** ela termina, **Then** acaba e não repete.
5. **Given** as faixas de New Bark Town, Route 29, batalha selvagem e Centro Pokémon, **When** o desenvolvedor as compara com o jogo original, **Then** soam reconhecivelmente iguais.

---

### User Story 2 - Efeitos sonoros e cries por nome ou número (Priority: P2)

O desenvolvedor pede um efeito sonoro (por nome ou número) ou o cry de um Pokémon (por espécie e
forma) e recebe o áudio pronto. Os 493 cries estão presentes, e o relatório diz quais faltam, se
algum faltar.

**Why this priority**: o combate e o overworld dependem desses sons, mas só depois de haver mapa,
personagens e música.

**Independent Test**: com amostras sintéticas, extrair efeitos e cries e consultá-los por nome e
número; com a ROM real, conferir no relatório que os 493 cries existem.

**Acceptance Scenarios**:

1. **Given** a ROM extraída, **When** o desenvolvedor pede um efeito sonoro pelo número que o script usa, **Then** recebe o áudio correspondente.
2. **Given** a ROM extraída, **When** o desenvolvedor pede o cry de qualquer um dos 493 Pokémon, **Then** recebe o áudio, e uma forma que o original distingue tem o próprio cry.
3. **Given** um cry que o original não define para uma forma, **When** o desenvolvedor o pede, **Then** recebe o da forma base e o relatório lista o caso.
4. **Given** o relatório, **When** o desenvolvedor o abre, **Then** vê as contagens de músicas, efeitos e cries e cada faixa faltando.

---

### User Story 3 - Reprodutor de desenvolvimento (Priority: P3)

O desenvolvedor abre uma página de desenvolvimento que lista todas as faixas extraídas (músicas,
efeitos e cries), toca qualquer uma, mostra onde está o loop e repete a faixa a partir do loop,
para comparar com o jogo original.

**Why this priority**: sem o reprodutor, conferir o som depende de abrir arquivos um a um. Ele
valida as histórias 1 e 2, mas não bloqueia o resto do jogo.

**Independent Test**: com faixas sintéticas, abrir a página, tocar uma faixa e ver o loop marcado;
sem áudio extraído, ver a mensagem pedindo para rodar a extração.

**Acceptance Scenarios**:

1. **Given** o áudio extraído, **When** o desenvolvedor abre a página, **Then** vê a lista de faixas por tipo, com identificador e nome.
2. **Given** a página aberta, **When** o desenvolvedor escolhe uma faixa, **Then** ela toca em até 2 cliques a partir da lista.
3. **Given** uma faixa com loop, **When** ela toca, **Then** a página marca onde o loop começa e termina e repete o loop depois da introdução.
4. **Given** a página aberta sem áudio extraído, **When** o desenvolvedor a abre, **Then** vê uma mensagem clara dizendo que a extração precisa rodar antes.

---

### Edge Cases

- **Faixa que a conversão não reproduz**: a etapa registra a faixa no relatório como não convertida, diz o motivo e segue para as demais; só falha quando a perda passa do limite aceito pelo relatório.
- **Faixa com loop, mas sem fim definido**: o loop usa o ponto de volta que o original guarda; se a faixa não tem ponto de volta, ela é tratada como sem loop.
- **Instrumento ou amostra ausente numa faixa**: a etapa diz a faixa e o instrumento, e não grava uma faixa com som errado em silêncio.
- **Faixa de duração muito longa ou loop muito curto**: a conversão respeita o original, e o relatório lista as faixas mais longas e o tamanho total.
- **Identificador sem faixa**: um número de música usado por um mapa ou script que não tem faixa aparece no relatório, em vez de falhar quando o jogo toca.
- **Faixas repetidas**: se duas entradas do original apontam para o mesmo som, o áudio não é gravado duas vezes e cada identificador resolve para ele.
- **Reextração**: com a mesma ROM, o áudio e os metadados saem idênticos byte a byte.
- **Pasta de saída com áudio anterior incompleto**: a etapa o substitui por inteiro, sem deixar uma mistura de versões.

## Requirements *(mandatory)*

### Functional Requirements

**Conversão**

- **FR-001**: A etapa MUST converter todas as sequências de música do arquivo de som da ROM em áudio utilizável pelo jogo.
- **FR-002**: A etapa MUST converter todos os efeitos sonoros do arquivo de som.
- **FR-003**: A etapa MUST converter os cries dos 493 Pokémon, incluindo as formas que o original distingue.
- **FR-004**: O áudio MUST soar reconhecivelmente igual ao original: mesmas notas, tempos, instrumentos e dinâmica das faixas.
- **FR-005**: A escolha entre pré-renderizar o áudio e tocar as sequências com os instrumentos extraídos MUST ser decidida e justificada no plano, pela fidelidade, pelo tamanho em disco e pela complexidade.

**Loop**

- **FR-006**: Uma faixa com introdução e loop MUST preservar os pontos de loop originais e MUST tocar a introdução uma vez só.
- **FR-007**: A volta do loop MUST ser contínua, sem silêncio, estalo ou salto audível.
- **FR-008**: Uma faixa sem loop no original MUST terminar e não repetir.

**Identificação**

- **FR-009**: Cada música MUST ser ligada ao identificador que os headers de mapa (feature 006) usam para o dia e para a noite.
- **FR-010**: Cada efeito sonoro e cada música tocada por script MUST ser ligado ao identificador que os scripts (feature 008) usam.
- **FR-011**: Os cries MUST ser ligados à espécie e à forma pelos identificadores da feature 004, e os efeitos e músicas MUST ter nome estável derivado do índice original, igual entre reextrações.

**Saída, validação e relatório**

- **FR-012**: A saída MUST ser áudio acompanhado de metadados com, para cada faixa: identificador, nome, tipo, duração e pontos de loop.
- **FR-013**: Cada arquivo de metadados MUST ter schema único, compartilhado entre o extrator e o jogo (princípio VI), validado ao gravar e ao carregar, com erro que diz arquivo, caminho do campo e problema (princípio III).
- **FR-014**: A saída MUST ser determinística: a mesma ROM gera áudio e metadados idênticos byte a byte.
- **FR-015**: O tamanho total do áudio extraído SHOULD ficar abaixo de 1 GB.
- **FR-016**: A etapa MUST gerar o relatório de áudio com a contagem de músicas, efeitos e cries, o tamanho total, cada faixa faltando ou não convertida com o motivo, cada identificador de mapa ou script sem faixa e cada cry resolvido pela forma base.
- **FR-017**: Uma faixa com erro de conversão MUST ser registrada no relatório com o motivo e MUST NOT impedir as demais, até um limite de perdas definido no relatório; os 493 cries não admitem perda.
- **FR-018**: A etapa MUST gravar a saída apenas na pasta de dados do usuário e MUST NOT gravar nenhum áudio no repositório (princípio II).

**Reprodutor de desenvolvimento**

- **FR-019**: O projeto MUST oferecer uma página de desenvolvimento que lista as faixas extraídas, toca qualquer uma e marca o loop, repetindo-o depois da introdução.
- **FR-020**: A página MUST ser usada só em desenvolvimento e MUST NOT fazer parte do app distribuído.

**Testes**

- **FR-021**: Os testes MUST usar sequências, bancos de instrumentos e amostras sintéticos e MUST NOT depender de dados reais da ROM (princípio II).
- **FR-022**: A conferência com a ROM real (faixas lado a lado com o original, loops e contagem de cries) MUST ser manual, separada da integração contínua.

### Key Entities

- **Faixa**: música, efeito sonoro ou cry, com identificador, nome, tipo, duração e áudio.
- **Loop**: par de pontos (início e fim) dentro de uma faixa, ou a ausência de loop.
- **Música de mapa**: ligação entre o identificador usado por um header de mapa (dia e noite) ou por um script e a faixa que toca.
- **Cry**: faixa ligada a uma espécie e forma.
- **Efeito sonoro**: faixa curta ligada ao identificador que os scripts e o jogo usam.
- **Relatório de áudio**: contagens por tipo, tamanho total, faixas faltando ou não convertidas e identificadores sem faixa.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: As faixas de New Bark Town, Route 29, batalha selvagem e Centro Pokémon, comparadas lado a lado com o jogo original, soam reconhecivelmente iguais em 4 de 4.
- **SC-002**: O loop de 10 faixas testadas não tem corte audível em 10 de 10.
- **SC-003**: Os 493 cries estão presentes, segundo o relatório (zero cries faltando).
- **SC-004**: O áudio extraído ocupa menos de 1 GB no total.
- **SC-005**: Duas extrações da mesma ROM produzem áudio e metadados idênticos byte a byte.
- **SC-006**: Os testes passam usando apenas dados sintéticos, sem acesso à ROM.
- **SC-007**: Todo erro de metadados inválido diz arquivo, campo e problema em 100% dos casos testados.
- **SC-008**: Qualquer faixa extraída toca na página de desenvolvimento em até 2 cliques a partir da lista.

## Assumptions

- A feature 003 entrega o acesso aos arquivos da ROM, a 004 entrega os identificadores de espécie e forma, a 006 entrega os identificadores de música dos mapas e a 008 entrega os scripts que citam música e efeitos; esta feature depende deles.
- "Reconhecivelmente igual" é julgado por escuta, lado a lado, pelo desenvolvedor, em 4 faixas combinadas (SC-001); não exige idêntico amostra por amostra.
- A conferência do SC-001 e do SC-002 é manual, com a ROM real, separada da integração contínua.
- "Todos" os efeitos e músicas significa tudo que o arquivo de som do jogo original define, sem filtrar por uso nos mapas.
- O limite de 1 GB é uma meta (SHOULD): se for ultrapassada, o plano justifica e o relatório mostra o tamanho.
- O limite aceito de faixas não convertidas é zero para os 493 cries e definido no relatório para o restante.
- Tocar o áudio no jogo, mixagem, volume (feature 26) e músicas que não existem no original estão fora do escopo.
- A página de desenvolvimento roda só no ambiente de desenvolvimento, lê o áudio da pasta de dados do usuário e não é empacotada.
