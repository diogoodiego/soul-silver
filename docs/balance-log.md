# Registro de balanceamento

Os dados extraídos da ROM são a base do balanceamento. Todo desvio desses valores MUST ser
registrado aqui, com valor original, valor novo e motivo (constituição, princípio I).

Adicione uma linha por desvio, a mais recente no fim. Se um desvio for revertido, registre a
reversão como uma nova linha em vez de apagar a antiga.

| Data | Item | Valor original | Valor novo | Motivo | Spec |
|------|------|----------------|------------|--------|------|
| 2026-10-24 | Precisão de todos os golpes | precisão (%) por golpe | ignorada; acerto pela hitbox (`content/combat/archetypes.json`, `moves.json`) | Em tempo real o acerto depende da mira | specs/013-realtime-combat |
| 2026-10-24 | PP de todos os golpes | PP por golpe | cooldown = clamp(0,6 + 1,2·poder/100 + 0,4·(35/PP − 1), 0,4 s, 8 s); golpes sem poder usam poder 40 (`tuning.json`) | PP vira tempo de recarga (FR-013) | specs/013-realtime-combat |
| 2026-10-24 | Speed | ordem do turno | movimento 60–110 px/s e corte de cooldown 0–30% entre Speed 15 e 150 (`tuning.json`) | Speed em tempo real, com limites (FR-014) | specs/013-realtime-combat |
| 2026-10-24 | Duração dos status | por turno | burn 8 s, poison 10 s, toxic 12 s (dano a cada 2 s), paralysis 10 s, sleep 1,5–4 s, freeze até 6 s (20% de descongelar por s), confusion 2–5 s (`statuses.json`) | Status com duração em segundos (FR-015) | specs/013-realtime-combat |
| 2026-10-24 | Confusão | 50% de bater em si | 50% de o golpe sair até 120° fora da mira | Pedido do spec 013 | specs/013-realtime-combat |
| 2026-10-24 | Estágio de precisão / evasão | multiplica a chance de acerto | precisão negativa desvia a mira 6° por estágio; evasão sem efeito | Não há rolagem de precisão | specs/013-realtime-combat |
| 2026-10-24 | Knockback e piscada | — | 6 px por acerto, piscada de 0,2 s | Feedback do tempo real | specs/013-realtime-combat |
| 2026-10-24 | Golpes de 2 a 5 acertos (DoubleSlap, Pin Missile, Fury Swipes, Bullet Seed…) | 2–5 acertos aleatórios | 3 acertos fixos | Simplificação inicial | specs/013-realtime-combat |
| 2026-10-24 | Golpes de poder variável | calculado na batalha | Low Kick e Grass Knot 60, Flail e Reversal 80, Return e Frustration 70, Hidden Power 60, Counter 60, Gyro Ball 80, Natural Gift 60, Fling 50, Trump Card 60, Wring Out 80 | Sem as condições originais (peso, felicidade, PP) | specs/013-realtime-combat |
| 2026-10-24 | Endeavor, Super Fang, Leech Seed, Stealth Rock | HP do usuário / ½ HP / dreno por turno / dano ao trocar | ½ do HP atual do alvo / ½ HP atual / 1/8 do HP atual drenado na hora / 1/8 ao entrar no campo | Sem turnos nem trocas | specs/013-realtime-combat |
| 2026-10-24 | Rest, Belly Drum, Yawn, Wish | dorme 2 turnos / custa ½ HP / sono no turno seguinte / cura no turno seguinte | só cura tudo / Ataque +6 sem custo / sono imediato / cura ½ na hora | Efeitos em si mesmo e atrasos ainda não modelados | specs/013-realtime-combat |
| 2026-10-24 | Light Screen, Reflect, Wrap | tela por 5 turnos / prende 2–5 turnos | Def. Esp. +1 / Defesa +1 no usuário / dano + Speed −1 no alvo | Aproximação sem efeitos de lado | specs/013-realtime-combat |
| 2026-10-24 | Dream Eater, Thrash, Petal Dance, Outrage | só em alvo dormindo / confunde o usuário depois | sem essas condições | Simplificação inicial | specs/013-realtime-combat |
| 2026-10-24 | Clima (Rain Dance, Sunny Day, Hail) | 5 turnos; granizo fere a cada turno | 20 s; granizo sem dano | Tempo real; dano do granizo fica para depois | specs/013-realtime-combat |
| 2026-10-24 | 37 golpes sem efeito em tempo real (ex.: Protect, Substitute, Attract, Disable, Encore, Taunt, Trick, Baton Pass, Mist, Safeguard, Sleep Talk, Mirror Move, Foresight) | efeito próprio | só o arquétipo, sem efeito | Mecânicas que dependem de turno ou troca; lista em `content/combat/moves.json` com `effects: []` | specs/013-realtime-combat |

<!--
Exemplo de linha (não é um desvio real):
| 2026-11-02 | Golpe Ember: tempo de recarga | — (por turno) | 1,2 s | Combate em tempo real não tem turnos | specs/00X-combate |
-->
