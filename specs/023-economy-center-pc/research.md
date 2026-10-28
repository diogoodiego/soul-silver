# Research: Economia, Centro Pokémon e PC

## R1. Origem dos estoques das lojas
- **Decision**: novo `shops.json` extraído do arm9: tabelas de mart (lista de ids de item por loja) e a lista progressiva do Poké Mart comum, indexada por insígnias. O id de loja é o argumento do `MartBuy` no script.
- **Rationale**: princípios I e III; os scripts já passam o id.
- **Alternatives**: tabela escrita à mão (viola fidelidade); ler o estoque dos scripts (não vem inline).
- **Risco**: os offsets das tabelas só se confirmam com a ROM. A primeira task de extração usa fixture sintético e a verificação manual contra Cherrygrove e Violet.

## R2. Regra de venda
- **Decision**: `floor(price / 2)`; `price = 0` ou `pocket = key-items` não vendável.
- **Rationale**: regra da geração 4; `items.json` já tem `price` e `pocket`.

## R3. Comando de script do PC
- **Decision**: o comando do PC é identificado nos scripts extraídos (o log de comandos faltantes de `bridge.ts` o mostra) e entra em `BRIDGED`, tratado como `MartBuy`.
- **Alternatives**: interceptar pelo objeto do computador no mapa (foge do script original).

## R4. Cura e ponto de retorno
- **Decision**: `healParty()` restaura HP e status e grava `respawn` com a entrada do Centro corrente; a gravação por entrada em `companion.ts` é removida, para o retorno só mudar após curar.
- **Rationale**: o spec exige que a cura marque o Centro.

## R5. PP
- **Decision**: o jogo não guarda PP (golpes têm cooldown em tempo real e `partyMember` não tem campo de PP). "Restaura a equipe" = HP e status. Registrar em `docs/balance-log.md` e ajustar o texto de PP do spec.
- **Rationale**: não há o que restaurar.

## R6. Caixas e migração
- **Decision**: 18 caixas × 30 vagas (valores do HGSS), nomes padrão "BOX 1"…; `storage` (até 30) migra em ordem para a caixa 1, sem perda. `boxes` é lista fixa de 18 com vagas `PartyMember | null`.
- **Rationale**: o limite atual de 30 cabe numa caixa.
- **Alternatives**: manter `storage` em paralelo (dois lugares para o mesmo dado).
- **A confirmar**: 18 × 30 e os nomes padrão contra a ROM.

## R7. Depósito de itens
- **Decision**: `pcItems` com o formato de `bag`, até 50 itens distintos e 999 cada (HGSS).

## R8. Atomicidade e concorrência
- **Decision**: cada operação é uma função pura sobre o `progress` do jogador que valida tudo e só então aplica. O servidor processa um tick por vez e os dados são por jogador, então não há corrida.
