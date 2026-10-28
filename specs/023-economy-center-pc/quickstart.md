# Quickstart: validação

Pré-requisito: dados extraídos e app buildado (skill `run-soulsilver`).

1. **Testes**: `pnpm -r test` cobre compra, venda, teto de dinheiro, cura, PC, migração v6 → v7 e as recusas do servidor.
2. **Loja**: em Cherrygrove City, falar com o atendente; conferir produtos e preços com o original; comprar 3 itens e vender 1.
3. **Violet City**: repetir; conferir os itens que dependem de insígnias antes e depois do Falkner.
4. **Cura**: ferir a equipe e falar com a enfermeira; HP e status restaurados; perder uma batalha e voltar àquele Centro.
5. **PC**: depositar, mover entre caixas, renomear, abrir o resumo, retirar; depositar e retirar itens.
6. **Captura com equipe cheia**: o Pokémon vai para a primeira vaga livre das caixas.
7. **Migração**: carregar um save v6 com Pokémon em `storage`; todos aparecem na caixa 1.

Mensagens em [contracts/protocol-v16.md](contracts/protocol-v16.md); dados em [data-model.md](data-model.md).
