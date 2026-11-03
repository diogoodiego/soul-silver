# Quickstart: validar a campanha até a Insígnia Zephyr

## Automático (CI-safe, fixtures sintéticas)

```sh
pnpm -r test
```

Esperado: extrator (`new-game.json` e `std-messages.json` do estágio `events` sobre ROM sintética), script de inicialização 9600 rodando uma vez na criação do save, migração save 7→8 e `restartStory`, aplicação de `new-game.json`, comandos `NameRival`/`BufferRivalsName`/`MsgBoxExtern`/`GetStdMsgNaix`/`TempBGM`/`ScrCmd_729`, histórico de flags, painéis do depurador e protocolo v17 passando.

## Caminho dourado (local, extração da ROM real; fora da CI)

```sh
npm run golden
```

Usa a extração do app; `SOULSILVER_DATA` aponta outra pasta `stages`. Esperado: "10 de 10 marcos", lutas resolvidas pelo bot do spec 019 (prêmio, flag e sem novo desafio), checks de loja, centro, PC e isolamento do segundo jogador passando, sem duplicados em nenhum marco, sem comandos faltando no caminho principal (opcionais listados à parte) e log do servidor vazio. Sem extração: falha com mensagem clara. Anexar o relatório ao `tasks.md`.
Sabotagem: desligar a gravação da flag da cena da mãe deve fazer o teste falhar no marco 2, com último script, posição, condições dos scripts de mapa/gatilhos e flags relevantes no relatório.

## Roteiro no app (camada 4, skill `run-soulsilver`)

O driver percorre o trecho com teleportes de desenvolvimento e salva 15 capturas em `.evidence/024/` (01-quarto … 15-insignia), cada uma com o overlay F3 (mapa e posição). Conferir cada captura contra a página do detonado e registrar no `walkthrough.md`.

## Manual (humano, sem comandos de desenvolvimento)

Jogar o trecho inteiro e anotar divergências no `walkthrough.md`. Pronto quando todas as linhas estão "Verificado no app".

1. Criar jogo novo (só nome e personagem) → começa no quarto, sem inicial.
2. Descer: cena da mãe; New Bark Town com cada personagem uma só vez.
3. Laboratório do Elm: escolher o inicial pela cena.
4. Jogar até Falkner na ordem do detonado (páginas 1–6); nomear o rival quando pedido.
5. Depurador (modo desenvolvimento): conferir objetos, scripts/gatilhos com condição e histórico de flags.
6. Carregar um save antigo: aviso "história desatualizada" com as duas opções.
