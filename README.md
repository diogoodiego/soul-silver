# SoulSilver Desktop

Remake de Pokémon SoulSilver como app desktop para Windows, feito em Electron, com multiplayer
LAN de 2 a 4 jogadores. O repositório contém apenas código: nenhuma ROM nem asset do jogo é
versionado ou distribuído. As regras do projeto estão na
[constituição](.specify/memory/constitution.md).

## Instalar o jogo

Para jogar, não é preciso nenhuma ferramenta de desenvolvimento nem permissão de administrador.

1. Abra a página de [releases](https://github.com/diogoodiego/soul-silver/releases/latest) e baixe
   `SoulSilver-Desktop-Setup-X.Y.Z.exe`.
2. Execute o arquivo. Na primeira vez, o Windows mostra o aviso **"O Windows protegeu o
   computador"** (SmartScreen), porque o app não tem assinatura de código, um certificado pago
   que este projeto não usa. Clique em **Mais informações** e depois em **Executar assim mesmo**.
3. O app instala sozinho, cria atalhos no menu Iniciar e na área de trabalho, e abre.

**Atualizações** são automáticas: ao abrir, o app procura uma versão nova, baixa em segundo plano
e pergunta se você quer reiniciar agora ou depois. Mantenha o app atualizado, porque versões
diferentes não conseguem jogar juntas. Sem internet, o app abre normalmente e só avisa que não
conseguiu verificar.

**Seus dados** (saves e arquivos extraídos da sua ROM) ficam em `%APPDATA%\SoulSilver Desktop` e
são mantidos ao desinstalar ou atualizar.

**Para desinstalar**: Configurações → Aplicativos → Aplicativos instalados → SoulSilver Desktop →
Desinstalar.

## Preparar o jogo (ROM)

O jogo não vem com nenhum gráfico, mapa ou som: tudo é extraído da **sua própria cópia** de
Pokémon SoulSilver. Na primeira vez que abrir o app:

1. Tenha em mãos o arquivo do seu cartucho de **Pokémon SoulSilver, versão dos EUA**, com
   extensão `.nds` (um dump do seu cartucho).
2. Clique em **Escolher arquivo** ou arraste o arquivo para a janela.
3. Espere a barra de progresso chegar ao fim. Quando aparecer **Assets prontos**, o jogo abre.

O arquivo nunca sai do seu PC. O app guarda uma cópia dele para refazer a extração sozinho quando
uma atualização precisar de arquivos novos, sem pedir a ROM de novo. Fechar o app no meio não
estraga nada: a extração continua na próxima vez.

**Se o arquivo for recusado**, a mensagem diz o motivo:

| Mensagem | O que fazer |
|----------|-------------|
| É um arquivo compactado (.zip, .7z, .rar) | Extraia o conteúdo e escolha o `.nds` que estava dentro. |
| Não é uma ROM de Nintendo DS | Escolha o arquivo `.nds` do jogo. |
| É de outro jogo / de Pokémon HeartGold | Só SoulSilver é aceito (HeartGold é a versão irmã). |
| É a versão de outra região | Só a versão dos EUA é aceita. |
| Está corrompido ou foi alterado | O arquivo está incompleto, danificado ou é um hack. Gere uma cópia nova do cartucho. |

**Onde ficam os arquivos**, dentro de `%APPDATA%\SoulSilver Desktop`:

- `rom\` — a cópia da sua ROM;
- `extraction\` — os arquivos extraídos;
- `logs\extractor.log` — o registro da extração.

**Se a extração falhar**, clique em **Abrir log**: o Explorer abre com o `extractor.log`
selecionado. Envie esse arquivo para quem mantém o jogo. Ele não contém nenhum dado da ROM.

## Pré-requisitos

- Windows 10 ou 11, 64 bits.
- [Git for Windows](https://git-scm.com/download/win).
- [Node.js](https://nodejs.org/) 24 LTS (a versão exigida está em [.nvmrc](.nvmrc)).

## Preparar o ambiente

```powershell
git clone <url-do-repositório> soul-silver
cd soul-silver
npm install
```

## Rodar o app

```powershell
npm run dev
```

Abre a janela "SoulSilver Desktop", que mostra a versão do app, o estado do servidor de jogo e o
contador de ticks (20 por segundo).

O `npm install` também baixa o binário do Electron (~100 MB), o que pode levar alguns minutos
na primeira vez.

## Extrator por linha de comando

A mesma biblioteca que o app usa roda pela linha de comando, sem Electron:

```powershell
npm run extract -- --list                              # etapas registradas
npm run extract -- --rom D:\roms\soulsilver.nds        # extrai para assets\ (ignorada pelo git)
npm run extract -- --rom D:\roms\soulsilver.nds --stages rom-unpack --force rom-unpack
npm run extract -- --rom D:\roms\soulsilver.nds --verify
```

Opções e códigos de saída: [contrato da CLI](specs/003-rom-extraction-pipeline/contracts/cli.md).

O extrator é um pipeline de etapas. Cada etapa declara versão, entradas e saídas, e só roda de
novo quando a versão muda ou a saída some ou é corrompida. Para criar uma etapa nova, veja
[como uma etapa se pluga](specs/003-rom-extraction-pipeline/contracts/extractor-library-api.md#como-uma-etapa-futura-se-pluga-specs-4-a-9).

## Checagens

Cada comando roda na raiz e cobre todos os pacotes (`app`, `client`, `server`, `shared`,
`extractor`):

```powershell
npm run typecheck   # TypeScript strict (e svelte-check no client)
npm run lint        # ESLint
npm test            # Vitest
```

Nenhuma task é concluída sem os três passando.

## Proteção de assets

O repositório nunca contém material da Nintendo (constituição, princípio II). Um hook de
pre-commit, instalado automaticamente pelo `npm install`, recusa o commit de:

- qualquer arquivo dentro de `assets/`, a pasta de saída do extrator (ignorada pelo git);
- ROMs (`.nds`);
- formatos extraídos do DS (`.narc`, `.ncgr`, `.nclr`, `.nsbmd`, `.sdat`, `.bmg` e outros);
- imagens e áudio fora de [`art/`](art/README.md), a única pasta para arte original do projeto.

Para conferir todos os arquivos versionados: `npm run check:assets`.

Testes nunca usam dados reais da ROM; veja a
[convenção de fixtures](packages/extractor/test/fixtures/README.md).

## Integração contínua

A cada push e pull request, o GitHub Actions roda num Windows (`windows-latest`) os passos
`Forbidden files`, `Typecheck`, `Lint` e `Test`
(veja [.github/workflows/ci.yml](.github/workflows/ci.yml)). O resultado aparece na aba
**Actions** do repositório e no próprio commit. A verificação de arquivos proibidos roda de novo
na CI para pegar commits feitos com `git commit --no-verify`.

## Publicar uma versão

1. Atualize `version` em [packages/app/package.json](packages/app/package.json) (por exemplo,
   `0.2.0`), rode `npm install` para atualizar o lockfile, e commite no branch principal.
2. Crie e envie a tag correspondente:

   ```powershell
   git tag v0.2.0
   git push origin v0.2.0
   ```

O workflow `Release` ([.github/workflows/release.yml](.github/workflows/release.yml)) valida a
tag, roda as checagens, gera o instalador, verifica que o pacote não contém nenhuma ROM nem
asset, gera as notas a partir dos commits desde a tag anterior e publica a release. Se qualquer
passo falhar, nenhuma release é criada.

Regras da tag: formato `vMAJOR.MINOR.PATCH` sem sufixo, igual à versão do app, e maior que todas
as versões já publicadas. Nunca reaproveite uma tag publicada.

Para gerar o instalador localmente, sem publicar: `npm run dist` (saída em `packages/app/dist/`).

## Problemas comuns

- **`npm install` falha com `EBADENGINE`**: a versão do Node não é a 24. Instale o Node 24 LTS
  (ou, com um gerenciador de versões como o nvm-windows, rode `nvm install 24` e `nvm use 24`)
  e repita o `npm install`.
- **`does not provide an export named 'BrowserWindow'`** ao rodar `npm run dev`: a variável de
  ambiente `ELECTRON_RUN_AS_NODE` está definida no terminal (alguns editores a definem). Rode
  num terminal sem ela ou remova-a com `Remove-Item Env:ELECTRON_RUN_AS_NODE` (PowerShell).
