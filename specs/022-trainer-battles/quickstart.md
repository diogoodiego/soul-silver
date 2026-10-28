# Quickstart: validar batalhas contra treinadores

## Automático
```sh
pnpm -r test
```
Esperado: testes de `shared/trainer` (perfil, troca por tipo, poção abaixo do limiar, prêmio), `server` (visão bloqueada por obstáculo, bola e fuga bloqueadas, isolamento entre batalhas, dois jogadores contra o mesmo treinador) e protocolo v15 passando.

## Manual (skill `run-soulsilver`)
1. Route 29: entrar na visão de um treinador → "!", aproximação, fala, arena. Atrás de obstáculo → nada.
2. Lutar: time sai na ordem original; poção usada abaixo do limiar; bola recusada com a mensagem original; fuga impossível.
3. Vencer: fala de derrota, dinheiro conferido com a fórmula ([research R4](research.md)), XP; passar de novo → sem desafio.
4. Perder: blackout.
5. Rival em Cherrygrove e Falkner pelos scripts originais; música de rival/líder e fanfarra.
6. Dois clientes LAN: o segundo não atinge os Pokémon da arena; ambos lutam com o mesmo treinador em paralelo.
