# Contrato: `shops.json` e `pc.json`

```json
{ "kind": "shops", "formatVersion": 1, "records": [ { "id": 0, "items": [ { "item": 4, "minBadges": 0 }, { "item": 3, "minBadges": 3 } ] }, { "id": 1, "items": [ { "item": 146, "minBadges": 0 } ] } ] }
```

- Id 0: Poké Mart comum (`MartBuy`), `sNormalMartItems` na ARM9 (0x020FBF22, 19 pares item/nível). O nível vira `minBadges` pelo switch do `MartBuy` (insígnias 0→1, 1-2→2, 3-4→3, 5-6→4, 7→5, 8+→6).
- Id n + 1: loja especial n (`SpecialMartBuy n`), tabela de 30 ponteiros na ARM9 (0x0210FA3C).
- Gerado pela etapa `events` (versão 4) em `events/shops.json`; preços vêm de `items.json`.

- Validado por zod no carregamento (arquivo, caminho do campo, problema).
- Gerado pelo extrator na pasta de dados do usuário; nunca commitado. Testes usam fixture sintético.
- `content/pc/pc.json` (escrito à mão, só se a ROM não trouxer): `{ "boxCount": 18, "slotsPerBox": 30, "defaultNames": [] }`.
