# Fixtures de dados do jogo

Builders **sintéticos** dos formatos binários originais (pesquisa R16 da feature 004):
registros de espécie, golpe, item, evolução e learnset, curvas de experiência, tabelas de
código (tipos, naturezas, TMs, tutores, mapa de itens) e um codificador BLZ (`blz-encode.ts`,
usado só pelos testes).

- Nada aqui contém dados da ROM; tudo é gerado por código.
- Os testes nunca leem a ROM real nem `assets/` (constituição, princípio II).
