# Feature Specification: Golpes de campo e locomoção

**Feature Branch**: `025-field-moves-locomotion`

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: "Golpes de campo e locomoção: golpes usados fora do combate para superar obstáculos, a bicicleta, o surf com encontros na água, a pesca, Headbutt em árvores, Flash em cavernas escuras e a fuga de cavernas."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Superar obstáculos com golpes de campo (Priority: P1)

O jogador interage com uma árvore, rocha, redemoinho, cachoeira ou parede. O jogo mostra o diálogo original do obstáculo. Se a equipe tem um Pokémon que sabe o golpe e o jogador tem a insígnia exigida, o jogo pergunta se quer usar o golpe, e o companheiro (ou o Pokémon que sabe o golpe) executa a ação e libera a passagem. Sem o golpe ou sem a insígnia, só o diálogo aparece e nada muda.

**Why this priority**: É o mecanismo que abre o mapa ao longo da história; sem ele o jogador não passa de Violet City.

**Independent Test**: Dar insígnia e golpe por comando de desenvolvimento, interagir com uma árvore de Cut e ver o tile liberado.

**Acceptance Scenarios**:

1. **Given** um jogador com a insígnia e um Pokémon com Cut, **When** interage com uma árvore de Cut e confirma, **Then** a árvore some e o tile fica livre para ele.
2. **Given** um jogador sem a insígnia exigida, **When** interage com o obstáculo, **Then** vê só o diálogo original e o obstáculo permanece.
3. **Given** um jogador com a insígnia mas sem o golpe na equipe, **When** interage, **Then** vê só o diálogo original e o obstáculo permanece.
4. **Given** os jogadores A e B no mesmo mapa, **When** A corta uma árvore, **Then** o tile fica livre só para A e continua bloqueado para B.
5. **Given** A cortou a árvore, **When** A sai do mapa e volta, **Then** a árvore está de volta.
6. **Given** uma rocha de Rock Smash ou uma árvore de Headbutt, **When** o jogador usa o golpe, **Then** pode surgir um Pokémon ou item conforme as tabelas extraídas.

---

### User Story 2 - Surfar e encontrar Pokémon aquáticos (Priority: P1)

Com a insígnia e um Pokémon com Surf, o jogador entra na água montado no Pokémon; o companheiro volta para a bola. Andando na água, ocorrem encontros com as espécies da tabela de surf daquele mapa. Em combate durante o surf, só Pokémon aquáticos, voadores e levitantes podem ser lançados, e o seletor indica quais.

**Why this priority**: Abre as rotas de água e traz os encontros que o spec 015 deixou de fora.

**Independent Test**: Entrar na água de um mapa real e conferir que o companheiro foi para a bola, que a espécie do encontro pertence à tabela do mapa e que lançar um terrestre é recusado.

**Acceptance Scenarios**:

1. **Given** um jogador com Surf e a insígnia, **When** entra na água, **Then** monta no Pokémon e o companheiro volta para a bola.
2. **Given** o jogador surfando, **When** ocorre um encontro, **Then** a espécie vem da tabela de surf do mapa.
3. **Given** o jogador surfando em combate, **When** tenta lançar um Pokémon terrestre, **Then** é recusado; um aquático, voador ou levitante é aceito.
4. **Given** o seletor aberto durante o surf, **When** o jogador olha a equipe, **Then** os Pokémon lançáveis estão indicados.
5. **Given** a classe de locomoção, **When** qualquer das 493 espécies é consultada, **Then** tem exatamente uma classe (terrestre, aquático, voador ou levitante).

---

### User Story 3 - Pescar com cada vara (Priority: P2)

O jogador usa Old Rod, Good Rod ou Super Rod perto da água. Após uma espera, há um momento de reação para fisgar. Se reagir a tempo, um Pokémon da tabela daquela vara surge na água próxima, pronto para combate. A chance de fisgar sobe com a amizade do companheiro.

**Why this priority**: Completa os encontros de água, mas não bloqueia a história.

**Independent Test**: 1.000 pescas simuladas por vara com semente fixa batem com a tabela de encontro dentro de uma margem estatística.

**Acceptance Scenarios**:

1. **Given** cada vara, **When** o jogador pesca, **Then** as espécies possíveis são as da tabela daquela vara e daquele mapa.
2. **Given** amizade maior do companheiro, **When** pesca, **Then** a chance de fisgar é maior.
3. **Given** o jogador não reage a tempo, **When** o momento passa, **Then** o peixe escapa e nenhum encontro ocorre.
4. **Given** um peixe fisgado, **When** o encontro começa, **Then** o Pokémon aparece na água próxima, pronto para combate.

---

### User Story 4 - Bicicleta, Fly, Flash e fuga de cavernas (Priority: P2)

O jogador anda de bicicleta (mais rápida que correr, proibida em interiores; o companheiro volta para a bola e toca a música de bicicleta). Usa Fly para abrir o mapa e voar a um ponto já visitado. Usa Flash para iluminar cavernas escuras, que sem ele têm visão reduzida. Usa Dig, Teleport ou Escape Rope para sair de cavernas.

**Why this priority**: Conveniência e fechamento do conjunto de locomoção.

**Independent Test**: Fly lista só os pontos visitados; a bicicleta é recusada em interior; a caverna escura fica visível com Flash.

**Acceptance Scenarios**:

1. **Given** o jogador em exterior, **When** monta a bicicleta, **Then** se move mais rápido que correndo, o companheiro vai para a bola e a música de bicicleta toca.
2. **Given** o jogador em interior, **When** tenta usar a bicicleta, **Then** é recusado.
3. **Given** pontos de voo visitados e não visitados, **When** abre o mapa do Fly, **Then** só os visitados são oferecidos.
4. **Given** uma caverna escura, **When** o jogador usa Flash, **Then** a visão aumenta; sem Flash a visão é reduzida.
5. **Given** o jogador numa caverna, **When** usa Dig, Teleport ou Escape Rope, **Then** sai da caverna conforme o original.

---

### Edge Cases

- Outro jogador está sobre o tile quando o obstáculo é removido para quem o removeu.
- Jogador desconecta ou troca de mapa no meio de Cut, surf ou pesca.
- Equipe sem nenhum Pokémon lançável durante o surf (todos terrestres).
- Dois jogadores interagem com o mesmo obstáculo ao mesmo tempo; cada um tem seu estado.
- Surf ou bicicleta usados em lugar onde são proibidos; Flash em caverna que não é escura.
- Pesca sem água adjacente, ou com o companheiro ausente (amizade indefinida).
- Fly para um ponto não visitado, forjado por um cliente (deve ser recusado pelo servidor).
- Comandos de desenvolvimento em build de produção (devem estar indisponíveis).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST suportar os golpes de campo Cut, Rock Smash, Strength, Surf, Whirlpool, Waterfall, Rock Climb, Flash, Fly e Headbutt, mais Dig, Teleport e o item Escape Rope.
- **FR-002**: A insígnia exigida por cada golpe MUST vir dos dados originais extraídos, não de valores fixos.
- **FR-003**: Ao interagir com um obstáculo, o sistema MUST mostrar o diálogo original e, se o jogador tem a insígnia e um Pokémon com o golpe, perguntar se quer usá-lo.
- **FR-004**: O sistema MUST fazer o companheiro executar a ação quando é ele quem sabe o golpe.
- **FR-005**: A remoção de um obstáculo MUST valer só para o jogador que a fez (princípio VII) e o obstáculo MUST reaparecer quando esse jogador sai do mapa.
- **FR-006**: O servidor MUST validar insígnia, golpe e posição de cada uso; pedidos inválidos MUST ser recusados.
- **FR-007**: Cada espécie MUST ter uma classe de locomoção em dados (terrestre, aquático, voador ou levitante), validada por schema para as 493 espécies; ela define por onde a espécie se move em combate.
- **FR-008**: Durante o surf, só espécies aquáticas, voadoras e levitantes MUST poder ser lançadas, e o seletor MUST indicar quais.
- **FR-009**: Ao surfar, o jogador MUST montar no Pokémon, o companheiro MUST voltar para a bola, e os encontros na água MUST usar as tabelas de surf extraídas.
- **FR-010**: O sistema MUST suportar pesca com Old Rod, Good Rod e Super Rod, com momento de reação ao fisgar; o resultado MUST seguir a tabela de cada vara.
- **FR-011**: A chance de fisgar MUST aumentar com a amizade do companheiro, como no original.
- **FR-012**: O Pokémon fisgado MUST aparecer na água próxima, pronto para combate.
- **FR-013**: Headbutt e Rock Smash MUST poder liberar Pokémon ou itens conforme as tabelas extraídas.
- **FR-014**: A bicicleta MUST ser mais rápida que correr e proibida em interiores; o companheiro MUST voltar para a bola e a música de bicicleta MUST tocar.
- **FR-015**: Fly MUST abrir o mapa listando só os pontos de voo já visitados pelo jogador.
- **FR-016**: Flash MUST iluminar cavernas escuras; sem ele, a visão nelas MUST ser reduzida.
- **FR-017**: Dig, Teleport e Escape Rope MUST levar o jogador para fora de cavernas conforme o original.
- **FR-018**: Em build de desenvolvimento, o sistema MUST oferecer comandos para dar insígnia, ensinar golpe, dar item e teleportar para um mapa e tile; em build de produção esses comandos MUST estar indisponíveis.
- **FR-019**: Os novos tipos de mensagem e dados MUST ser versionados (princípio VI), com a versão do protocolo incrementada.

### Fora do escopo

- Conteúdo de história que usa esses golpes além de Violet City (Marcos 4 e 5).
- Eventos especiais, como o Gyarados vermelho.

### Key Entities *(include if feature involves data)*

- **Obstáculo de campo**: elemento do mapa (árvore, rocha, redemoinho, cachoeira, parede, caverna escura) com o golpe e a insígnia exigidos e o diálogo original; estado de remoção por jogador.
- **Golpe de campo**: golpe usável fora do combate, com insígnia exigida e efeito.
- **Classe de locomoção**: atributo da espécie (terrestre, aquático, voador, levitante).
- **Estado de locomoção do jogador**: a pé, correndo, bicicleta, surfando ou pescando.
- **Tabela de encontro de pesca/surf/Headbutt/Rock Smash**: espécies, níveis e chances por mapa e por vara.
- **Ponto de voo**: cidade que o jogador já visitou.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Para cada golpe, todas as 4 combinações (com/sem insígnia × com/sem golpe) dão o resultado esperado em 100% dos casos.
- **SC-002**: Em 1.000 pescas simuladas por vara, as frequências por espécie ficam dentro da margem estatística da tabela, e a taxa de fisgar cresce com a amizade.
- **SC-003**: As 493 espécies têm classe de locomoção válida (0 faltando).
- **SC-004**: Nenhuma remoção de obstáculo por um jogador altera o mapa visto por outro (0 vazamentos nos cenários multijogador).
- **SC-005**: Todos os casos das camadas 1 e 2 passam na integração contínua.
- **SC-006**: A sonda de campo passa com todos os tipos de obstáculo encontrados nos dados reais (bloqueado antes, livre depois).
- **SC-007**: As 8 capturas da camada 4 mostram o comportamento esperado.
- **SC-008**: O tempo de reação da pesca é considerado justo com teclado e com gamepad no teste manual.

## Como testar *(mandatory)*

| Camada | Casos de teste | Comando |
|--------|----------------|---------|
| 1. Unidade (vitest com fixtures sintéticos; CI) | Tabela de regras por golpe (com/sem insígnia, com/sem golpe); 1.000 pescas por vara com semente fixa e chance de fisgar crescente com a amizade; classe de locomoção das 493 espécies validada por schema | `npx vitest run` |
| 2. Servidor sem interface (`packages/server/test/harness.ts`, 2 a 4 jogadores; CI) | A corta árvore: livre para A, bloqueada para B; A sai e volta: árvore de volta. Surf: companheiro na bola, terrestre recusado, aquático aceito. Fly lista só visitados. Bicicleta recusada em interior | `npx vitest run` |
| 3. ROM real (só local, nunca na CI) | Sonda de campo: acha nos dados extraídos um exemplo real de cada obstáculo (Cut, Rock Smash, Strength, redemoinho, cachoeira, Rock Climb, caverna escura); com insígnia e golpe por comando de desenvolvimento, passagem bloqueada antes e livre depois. Pesca e surf em água real: espécies pertencem à tabela do mapa | `npm run golden` ou sonda de campo equivalente |
| 4. App (driver da skill `run-soulsilver`) | Capturas: 01 e 02 árvore antes/depois do Cut; 03 surfando; 04 momento de fisgar; 05 mapa do Fly; 06 e 07 caverna escura sem/com Flash; 08 bicicleta | `node .claude/skills/run-soulsilver/driver.mjs [passos]` |
| 5. Manual | Tempo de reação da pesca justo com teclado e com gamepad | Não há |

**Conclusão**: as camadas 1 e 2 passam na integração contínua; a camada 3 passa localmente, com o
relatório anexado ao `tasks.md`; as 8 capturas da camada 4 estão salvas em `.evidence/025/`, pasta
fora do git.

## Assumptions

- Os dados originais extraídos (spec 015 em diante) já trazem as tabelas de encontro de surf, pesca, Headbutt e Rock Smash e as exigências de insígnia; o que faltar é incluído na extração.
- O diálogo do obstáculo e a pergunta de uso reutilizam o interpretador de scripts e o sistema de diálogo existentes.
- A progressão (insígnias, pontos de voo visitados) já é por jogador (princípio VII).
- A estrutura de combate do spec 015 é reutilizada para os encontros de água.
- A música de bicicleta usa o sistema de áudio existente.
- Os comandos de desenvolvimento são restritos a build de desenvolvimento, nunca a produção.
- O momento de reação da pesca segue o original; o ajuste fino para teclado e gamepad sai do teste manual.
