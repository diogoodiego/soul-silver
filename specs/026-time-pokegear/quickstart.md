# Quickstart: validar Tempo e Pokégear

Pré-requisitos: dependências instaladas; para as camadas 3 e 4, a extração concluída (o app reextrai sozinho quando a versão de um estágio muda; `SOULSILVER_DATA` aponta para outra pasta `stages`); save de teste no slot 3.

## Camadas 1 e 2 (CI)

```text
npx vitest run packages/shared/test/time packages/shared/test/phone packages/shared/test/radio packages/shared/test/script/weekday.test.ts packages/shared/test/script/phone.test.ts
npx vitest run packages/server/test/clock.test.ts packages/server/test/dev-clock.test.ts packages/server/test/field-time.test.ts packages/server/test/field-weekday.test.ts
npx vitest run packages/server/test/phone-queue.test.ts packages/server/test/phone-handlers.test.ts packages/server/test/phone-rematch.test.ts packages/server/test/radio.test.ts packages/server/test/gear.test.ts
npx vitest run packages/shared/test/save packages/extractor/test/events/phone.test.ts packages/extractor/test/maps/header.test.ts
```

Esperado: 24 faixas corretas, tonalidade contínua nos 1440 minutos, 7 dias, efeito do Pokémon Music no teto de spawns (March e Lullaby), relógio de dia para noite muda a faixa e as tabelas para todos, ligação adiada em combate, cutscene, menu e com o Pokégear aberto, oferta do número e revanche por jogador, migração 9 → 10.

## Camada 3 (local)

```text
npm run golden
```

Esperado: a extensão do caminho dourado passa o marco do Joey (oferta e registro do número; numa segunda sessão, com as flags da Radio Tower e do grupo de revanche 2 no lugar da história posterior, a ligação de revanche com o texto extraído e a vitória no time de revanche), a ligação do Elm pelo telefone e, para cada evento por dia da semana até Violet City, o NPC só no dia certo (`golden/time.golden.ts`). Anexar o relatório ao `tasks.md`.

## Camada 4 (app)

```text
node .claude/skills/run-soulsilver/driver.mjs [passos]
```

Capturas em `.evidence/026/`: 01 a 03 New Bark de manhã, de dia e de noite (relógio fixado por `debugSetClock`); 04 interior à noite sem cor; 05 a 08 abas mapa, telefone, rádio e relógio; 09 ligação recebida.

## Camada 5 (manual)

Ler um canal de rádio e confirmar que os textos são legíveis e na ordem.

## Atalho de desenvolvimento

`debugSetClock` fixa ou avança o relógio da sessão; em produção é descartado.
