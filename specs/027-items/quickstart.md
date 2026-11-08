# Quickstart: validar Itens

Pré-requisitos: `npm install`; para as camadas 3 e 4, a ROM extraída (`SOULSILVER_ROM`) e o app compilado. Contratos em [contracts/](contracts/), entidades em [data-model.md](data-model.md).

## Camadas 1 e 2 (CI)

```text
npm run typecheck && npm run lint
npx vitest run packages/shared/test/items packages/shared/test/save/migrate-v11.test.ts
npx vitest run packages/server/test/items-combat.test.ts packages/server/test/held.test.ts packages/server/test/trees.test.ts packages/server/test/world-items.test.ts
```

Esperado: tudo verde. Cenários do harness: Potion em combate respeita o tempo de uso e o Pokémon leva dano durante ele; item sem posse é recusado e a mochila não muda; berry segurada é consumida ao cruzar o limiar; item do chão pego por A segue disponível para B.

## Camada 3 (local)

```text
npm run items:coverage          # falha se algum item obtível até Violet City está sem efeito
npm run golden                  # inclui o cenário de uso de cada item da mochila e a sonda do Dowsing
```

Esperado: relatório de cobertura limpo no trecho; a sonda acha os itens escondidos das rotas 29 a 31 conforme os eventos extraídos. Anexar os relatórios ao `tasks.md`.

## Camada 4 (app)

```text
node .claude/skills/run-soulsilver/driver.mjs [passos]
```

Capturas em `.evidence/027/`: 01 seletor rápido em combate; 02 berry consumida com o número de cura; 03 TM sendo ensinado; 04 evolução por pedra; 05 Dowsing apontando; 06 Kurt recebendo apricorns. Usar o save do slot 3.

## Camada 5 (manual)

Em combate, com gamepad, abrir o seletor, escolher uma Potion e confirmar que o Pokémon continua se movendo e atacando conforme `tuning.json` durante o uso.
