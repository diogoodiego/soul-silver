# Bloco C: Combate de ação

Prompts do bloco avulso C: parry, esquiva, defesa, combos e golpes especiais com cooldown, no lugar
da barra de ação única. Entra antes do 034.5 (o balanceamento de Johto é refeito sobre ele).
As regras abaixo saíram da demanda do desenvolvedor e da entrevista de 2026-11-21. Os números ficam em
`content/combat/tuning.json` e `content/ai/*.json`, não no código.

## Regras consolidadas

### Classes de golpe

- **Normal:** golpe de dano com poder < 80. Sem cooldown (só ao errar o 1º da sequência, ver abaixo). Pode ser aparado (indicador branco).
- **Especial:** golpe de dano com poder ≥ 80, golpe de status (poder 0) e golpe de dano fixo ou
  variável (Seismic Toss, Night Shade, Dragon Rage, Sonic Boom e os de poder 1 nos dados). Tem cooldown
  e não pode ser aparado, só esquivado (indicador vermelho).
- Cooldown do especial: `5 + (poder − 80) / 10` s, no máximo 12 s (80 → 5 s, 120 → 9 s, 150 → 12 s).
  Status e dano fixo: 5 s.
- Cada Pokémon tem 4 slots: 2 normais (golpes 1 e 2) e 2 especiais (golpes 3 e 4). Um slot sem golpe
  da sua classe fica vazio. No início do jogo, os especiais costumam ficar vazios e viram desbloqueio
  de progressão.
- O dano dos golpes normais é multiplicado por `normalDamageMul` = 1/3.
- Tipos, STAB, efetividade, imunidade, crítico, clima e itens seguem como hoje.
- **Precisão:** ao atingir a hitbox, rola a precisão do golpe × os estágios de precisão do atacante e
  de evasão do alvo (fórmula do original). Quando falha, emite "errou" sem dano nem efeito. O desvio de
  mira por precisão reduzida sai.

### Preparo, cadência e salto

- O primeiro golpe normal de uma sequência tem 0,4 s de preparo. O 2º e o 3º, 0,2 s cada. Depois do 3º,
  a cadência volta para 0,4 s. Uma pausa maior que a janela de combo também reinicia a sequência.
- Quando o primeiro golpe normal de uma sequência não atinge ninguém (errou, foi esquivado ou aparado, alvo imune),
  esse golpe fica 1 s em cooldown (`normalMissCooldownS`), contado de quando se sabe que errou (o projétil some), e a
  sequência recomeça. O outro golpe normal segue livre. O 2º e o 3º não têm cooldown. Vale para a CPU também.
- O especial tem 0,8 s de preparo.
- Golpes de contato (`melee` e `dash`), normais e especiais, carregam mirando o adversário mais próximo, e o Pokémon
  pode andar enquanto carrega. No fim do preparo, ele pula de onde está até encostar (no máximo `leapMaxPx`, ~3 tiles, a
  `leapSpeedPx`) e só ao pousar o golpe sai. A direção fica travada no começo do pulo, e no ar ele não anda. Já
  encostado, o golpe sai no fim do preparo. A finta vale até o começo do pulo; a janela de parry, até o pouso.
- Os outros golpes disparam de onde o Pokémon está, com a mesma cadência, e também deixam andar durante o preparo.

### Combo

- Cada golpe normal que acerta (qualquer alvo) soma 1 ao contador, se vier até 1,5 s depois do acerto
  anterior.
- O dano ganha +1% por ponto do contador, até +10%. O contador continua subindo entre as sequências de 3.
- O contador zera quando o golpe erra, quando passam 1,5 s sem acerto, quando o Pokémon recebe dano ou
  quando sofre parry.
- Um especial que acerta recebe o bônus do contador e zera o combo (vira o "finalizador").
- Vale para a CPU também.

### Esquiva

- É acionada pela tecla Space (`dash`, como hoje). Dá um deslocamento curto na direção do movimento
  (como o dash atual) e deixa o Pokémon invulnerável por 0,5 s. Golpes atravessam o Pokémon sem acertar.
- **Animação:** o sprite aparece duplicado, alternando de posição rápido, durante os 0,5 s.

### Parry e defesa

- É acionado pela tecla H (`guard`, ação nova; no controle, o B, que só corre fora de combate). Apertar põe o
  Pokémon na pose de parry por 0,5 s (`action.parryPoseS`), parado.
- Com o botão pressionado, um golpe que o tocar sem parry registrado cai na **defesa**, mesmo durante a pose: reduz
  em 80% o dano dos golpes normais e não reduz nada dos especiais (vermelhos). Depois da pose, segurar mantém o
  Pokémon parado em defesa. Errar e soltar leva o dano todo.
- O cooldown começa ao soltar. Na defesa, o Pokémon não ataca nem esquiva.
- **Janela do golpe:** vai do início do preparo do golpe normal até ele ser lançado (no de contato, o pouso). Cada golpe guarda quem apertou
  nesse tempo (`casting.parriedBy`); apertar antes do preparo ou depois do lançamento é erro. Um aperto vale para todos
  os golpes normais em preparo. Golpe cancelado (finta, flinch, atordoamento, desmaio) descarta o registro.
- **Latência:** o que vale é o que a tela de quem apertou mostrava, até 0,15 s atrás (`action.lagMaxS`): apertar com o
  indicador aceso apara, mesmo que o aperto chegue ao servidor depois do lançamento. Para isso, o contato num Pokémon de
  jogador se resolve 0,1 s depois. A esquiva e a defesa seguem a mesma regra.
- **Confirmação no contato:** só quando o projétil ou a área toca em quem apertou o parry acontece, por mais tarde que
  seja. Sem contato (saiu da frente, esquivou), nada acontece. O registro é de cada defensor: os outros na área levam
  o golpe, e um Pokémon que entra no lugar não herda o parry.
- **Parry bem-sucedido:** no contato, o golpe não causa dano nem efeito (antes do teste de precisão). O atacante, a
  qualquer distância, fica atordoado por 2 s ou até receber um golpe. O golpe que quebra o stun leva +10% de dano
  (todos os hits desse golpe, se for multi-hit).
- O atacante aparado é empurrado 24 px para longe de quem aparou (`action.parryPushPx`). Enquanto dura o
  stun, o sprite fica tombado para trás, com um 💫 acima da cabeça.
- Quem aparou fica invulnerável por 1 s.
- O cooldown do parry conta normalmente, mesmo depois de um parry bem-sucedido.
- Um especial não tem janela: acerta normalmente.
- A CPU apara em um momento sorteado do preparo; no recuo, o treinador só levanta a defesa no instante do lançamento.
- **Animações:**
  - Parry: sprite todo branco, com uma faixa de luz passando por ele, por 0,5 s.
  - Defesa: a mesma do parry, mas constante.
- **Finta:** apertar `guard` durante o preparo de um golpe do jogador cancela o golpe sem acionar o
  cooldown dele e já abre o parry. Só Pokémon de jogadores podem fintar; no PvP, os dois lados podem.
- Cooldowns de esquiva e de parry são separados. Cada um vai de 0,8 s (Velocidade alta) a 1,6 s
  (Velocidade baixa), na mesma escala de `speedScale`.

### Indicador de golpe

- Aparece acima do atacante no início do preparo: branco para golpe normal, vermelho para especial.
- Só a cor muda com a classe; o tamanho é fixo.
- Só aparece sobre Pokémon da CPU (selvagens e de treinador). Golpes de jogadores, inclusive no PvP,
  não mostram indicador.
- Buffs em si mesmo (comportamento `self-buff`, como Swords Dance) não mostram indicador, embora sejam
  especiais e tenham cooldown.

### IA

- **Selvagem (agressivo e impulsivo):**
  - Encadeia normais sem recuar, em sequências de 1 a 3 golpes ao acaso.
  - Quando o especial está pronto, usa ~30% das vezes.
  - Nunca entra em defesa.
- **Treinador (estratégico):**
  - Combo de 3 golpes normais, depois recua por 1 s (afasta-se do alvo). Se estiver sob ataque durante
    o recuo, entra em defesa.
  - Usa o especial sempre que ele estiver pronto e o alvo estiver ao alcance.
- **Reação** a um golpe que pode ser evitado (decidida ao ver o preparo, disparada `reactLeadS` antes de o golpe chegar):
  - Chance por grupo: selvagem 20%, treinador comum 40%, líder de ginásio ~50%, Elite Four, Lance e Red ~60%.
  - Essas chances substituem o `dodgeChance` dos perfis (agora `reactChance`, a chance do treinador; a do selvagem fica em `content/ai/tuning.json`).
  - Golpe branco: esquiva ou parry, 50/50. Golpe vermelho: sempre esquiva.
- A CPU não finta.

### Itens que usavam a barra de ação

- **Ether:** zera o cooldown de 1 especial.
- **Elixir:** zera o cooldown dos 2 especiais.
- **PP Up / PP Max:** −5% / −15% no cooldown daquele especial.
- **Quick Claw:** chance de o primeiro golpe da sequência sair com 0,2 s de preparo.
- **Leppa Berry:** tira os seus segundos do cooldown do próximo especial, uma vez.

### Saves e golpes aprendidos

- A migração separa os 4 golpes de cada Pokémon por classe. Com 3 ou mais da mesma classe, ficam os
  mais recentes, e os demais vão para uma lista de golpes esquecidos do membro (para um Move Reminder
  futuro).
- Ao aprender um golpe, a tela pede qual slot da mesma classe substituir.
- Um HM que saiu dos slots continua valendo no campo: `pickUser` também procura nos esquecidos. Em combate,
  só os slots contam.

## C.1 Classes de golpe e slots 2+2

Item C.1 do roadmap (avulso, bloco C): Classes de golpe e slots 2+2.
Fazer:
- Criar em `shared/combat` uma função pura `moveClass(move)` → `normal | special`, seguindo "Classes de
  golpe" acima.
- Membros da equipe guardam golpes em 4 slots fixos (0–1 normais, 2–3 especiais, vazio permitido).
- Migração do save: separar por classe e mover o excedente para a lista de esquecidos do membro.
- Ao aprender um golpe por nível ou TM, substituir só dentro da classe dele.
- Selvagens e treinadores montam os slots do mesmo jeito: pelo learnset, ficando os mais recentes de
  cada classe.

Pronto quando: testes cobrem `moveClass` (79, 80, 0, dano fixo, poder variável), a migração com 4
normais, com 4 especiais e com mistos, e o aprendizado de golpe com e sem slot livre da classe.

Regras do item:
- Test-first.
- Muda o save: suba `schemaVersion` e escreva a migração com teste. Se o protocolo levar os slots,
  suba-o também.
- Textos novos passam pela estrutura de i18n.

Verificação: leve (CLAUDE.md).

## C.2 Rolagem de precisão

Item C.2 do roadmap (avulso, bloco C): Rolagem de precisão.
Fazer:
- No `hit` do servidor, antes do dano, rolar a precisão do golpe × os estágios de precisão do atacante e
  de evasão do alvo, com a tabela de estágios do original.
- Golpes com precisão "sempre acerta" pulam a rolagem.
- Errar emite um evento `missed`.
- Remover o desvio de mira por precisão reduzida (`accuracyDeviationDeg`).

Pronto quando: testes, com RNG semeado, cobrem acerto, erro, estágios ±6 e "sempre acerta"; o harness
continua passando.

Regras do item:
- Test-first. Muda o protocolo (evento novo): suba a versão.

Verificação: leve (CLAUDE.md).

## C.3 Cooldown de especial e cadência de normais

Item C.3 do roadmap (avulso, bloco C): Cooldown de especial e cadência de normais.
Fazer:
- Remover a barra de ação (`gauge`).
- Normais: sem cooldown, cadência de preparo 0,4 → 0,2 → 0,2 s, reiniciada após o 3º golpe ou ao
  passar a janela de combo.
- Especiais: preparo de 0,8 s e cooldown próprio por slot, pela curva de "Classes de golpe".
- `normalDamageMul` (1/3) em `tuning.json`.
- Itens: Ether, Elixir, PP Up/Max e Quick Claw conforme "Itens que usavam a barra de ação".
- O `minCastS` geral dá lugar aos preparos por classe; os testes de mecânica seguem com preparo 0.
- A IA passa a ler cooldowns por slot no lugar da barra.

Pronto quando: testes cobrem a curva de cooldown (80, 100, 150, status), a cadência e o reinício, o
multiplicador de dano normal e cada item.

Regras do item:
- Depende de: C.1.
- Test-first. Muda o protocolo (estado do combatente): suba a versão.

Verificação: leve (CLAUDE.md).

## C.4 Salto dos golpes de contato

Item C.4 do roadmap (avulso, bloco C): Salto dos golpes de contato.
Fazer:
- (Regra trocada depois: ver "Preparo, cadência e salto".) Golpe normal de comportamento `melee` ou `dash`: durante o
  preparo, o Pokémon salta em direção ao alvo mirado até encostar, no máximo `leapMaxPx` (~3 tiles), respeitando paredes e água como `shift`.
- Sem alvo ao alcance, salta o máximo na direção da mira.
- Projéteis e áreas não saltam.

Pronto quando: testes cobrem salto até encostar, salto limitado, parede no caminho e projétil sem salto.

Regras do item:
- Depende de: C.3.
- Test-first.
- Contato vem do comportamento, sem mudar o schema de dados extraídos.

Verificação: leve (CLAUDE.md).

## C.5 Esquiva, parry e defesa

Item C.5 do roadmap (avulso, bloco C): Esquiva, parry e defesa.
Fazer, no servidor, conforme "Esquiva" e "Parry e defesa":
- **Esquiva:**
  - 0,5 s de invulnerabilidade, mantendo o deslocamento do dash atual.
- **Parry:**
  - Ação `guard` (bit novo do input; tecla H).
  - Janela de 0,5 s ao apertar.
  - Atordoamento do atacante por 2 s ou até o próximo golpe, com +10% nesse golpe.
  - 1 s de invulnerabilidade para quem aparou.
- **Defesa:**
  - Ao segurar após a janela: parado e −80% em golpes normais.
- **Finta:**
  - Só Pokémon de jogadores.
- **Cooldowns:**
  - Separados para esquiva e parry, de 0,8 a 1,6 s pela Velocidade.
  - Começam ao terminar a ação; no parry e na defesa, ao soltar.
- Atordoado não se move, não ataca, não esquiva nem apara.
- O estado (invulnerável, aparando, defendendo, atordoado, cooldowns) vai para o cliente.

Pronto quando: testes cobrem:
- Esquiva contra normal e contra especial.
- Parry contra normal (com o atacante longe), contra especial (falha) e contra multi-hit.
- O stun quebrado pelo golpe com +10%.
- A invulnerabilidade de 1 s contra um segundo atacante.
- Defesa contra normal e contra especial.
- Finta sem cooldown e com parry aberto.
- Os limites de cooldown por Velocidade.

Regras do item:
- Depende de: C.3.
- Test-first.
- Muda o protocolo (bit de input e estado): suba a versão.
- No controle, o parry fica no B (correr não age em combate).

Verificação: leve (CLAUDE.md).

## C.6 Contador de combo

Item C.6 do roadmap (avulso, bloco C): Contador de combo.
Fazer:
- No servidor, um contador por combatente conforme "Combo": janela de 1,5 s, +1% por ponto até +10%, e
  as condições de zerar.
- Um especial que acerta recebe o bônus e zera o contador.
- O contador vai no estado do combatente.

Pronto quando: testes cobrem subida até 10 e o teto, a janela, cada condição de zerar e o finalizador
especial.

Regras do item:
- Depende de: C.3, C.5.
- Test-first. Muda o protocolo: suba a versão.

Verificação: leve (CLAUDE.md).

## C.7 IA de combate

Item C.7 do roadmap (avulso, bloco C): IA de combate.
Fazer:
- Duas estratégias em `shared/ai`, conforme "IA":
  - Selvagem: sequências de 1 a 3 normais e especial em ~30% das vezes.
  - Treinador: 3 normais, recuo de 1 s com defesa se sob ataque, especial sempre que pronto.
- Reação a golpes que podem ser evitados, com chance por grupo em `content/ai/profiles.json`
  (substituindo `dodgeChance`). Branco: 50/50 esquiva ou parry. Vermelho: esquiva.
- O bot de referência (spec 019) passa a usar esquiva, parry e combos.

Pronto quando: testes, com RNG semeado, cobrem cada estratégia, as chances de reação (amostra grande),
a escolha no branco e no vermelho, a defesa no recuo e a ausência de finta na CPU; o harness continua
passando.

Regras do item:
- Depende de: C.5, C.6.
- Test-first.

Verificação: leve (CLAUDE.md).

## C.8 Cliente: indicadores, animações e HUD

Item C.8 do roadmap (avulso, bloco C): Indicadores, animações e HUD do combate de ação.
Fazer:
- **Indicador:** em volta de Pokémon da CPU, com a arte de `art/`; nenhum em `self-buff`. Golpe normal:
  `Normal.svg` a 100% e 10% maior durante todo o preparo; some no lançamento. Especial: `Special.svg`. Aparado:
  `Parry.svg` por 0,4 s a partir do contato (`action.parryMarkS`).
- **Animações:**
  - Esquiva: sprite duplicado, alternando de posição rápido por 0,5 s.
  - Parry: sprite branco com faixa de luz passando, por 0,5 s.
  - Defesa: a mesma do parry, constante.
  - Atordoado: um efeito sobre o sprite.
- **Combo:** contador animado perto do atacante.
- **HUD:**
  - Os 4 slots com a classe de cada um.
  - O cooldown dos especiais no lugar da barra de ação.
  - Os cooldowns de esquiva e parry.
- **Golpe novo:** a tela de aprender pede o slot da mesma classe.
- A ação `guard` entra nas opções de teclas.

Pronto quando: os componentes leem o estado do protocolo e não há valores de jogo no cliente.

Regras do item:
- Depende de: C.5, C.6.
- Render e UI ficam isentos de test-first.
- Tipografia: só a escala do Tailwind. Cores: só os tokens do `@theme`.
- Textos novos passam pela estrutura de i18n.

Verificação: leve (CLAUDE.md). O visual vai para o roteiro manual em `.evidence/C/`.

## C.9 Verificação

Item C.9 do roadmap (avulso, bloco C): Verificação do bloco C.
Fazer: verificação completa (CLAUDE.md) e o roteiro manual em `.evidence/C/`:
- Leitura dos indicadores.
- Sensação da esquiva e do parry (janela de 0,5 s com reação humana).
- Cadência dos combos.
- Finta contra treinador.
- Luta com 2 ou mais oponentes (a invulnerabilidade de 1 s).
- Uma luta de ginásio inteira.
- Registrar em `docs/balance-log.md` o tempo para nocaute (TTK) medido pelo bot com `normalDamageMul`
  de 1/3, para o 034.5.

Pronto quando: as verificações automáticas passam e o roteiro está escrito.

Verificação: completa (CLAUDE.md).
