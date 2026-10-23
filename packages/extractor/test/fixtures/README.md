# Fixtures de teste

Convenção para todos os pacotes: fixtures ficam em `packages/<pacote>/test/fixtures/`.

- Fixtures são **sintéticos e gerados por código**: builders em TypeScript que montam buffers e
  objetos em memória durante o teste (por exemplo, um NARC mínimo com dois arquivos).
- Não versione arquivos binários de fixture. Os formatos do DS são bloqueados pelo hook de
  pre-commit em qualquer pasta, inclusive aqui.
- Testes nunca leem a ROM nem dados extraídos dela (constituição, princípio II).

## Builders do extractor

- `build-narc.ts`: `buildNarc(members, names?)` monta um NARC válido (`BTAF`, `BTNF`, `GMIF`).
- `build-nds-rom.ts`: `buildNdsRom(options)` monta uma ROM de DS com cabeçalho, CRCs, ARM9/ARM7,
  overlays, FNT, FAT, banner e arquivos; também exporta `sha1Hex` e `corruptByte`.
- `build-fnt.ts` e `byte-writer.ts`: apoio aos dois acima.
- `builders.test.ts` confere os próprios builders.
