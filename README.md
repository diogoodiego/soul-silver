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

## Dados do jogo

Depois do desempacotamento, o extrator converte os números do jogo em arquivos JSON validados
por schema (`@soulsilver/shared/game-data`). Eles ficam em `stages/<etapa>/json/`, dentro da pasta
de extração (`assets\` na CLI):

| Etapa | Arquivos |
|-------|----------|
| `data-species` | `species.json` (espécies e formas alternativas) |
| `data-moves` | `moves.json` |
| `data-learnsets` | `learnsets.json`, `machines.json`, `tutors.json` |
| `data-evolutions` | `evolutions.json` |
| `data-items` | `items.json` |
| `data-tables` | `types.json`, `type-chart.json`, `natures.json`, `growth-rates.json`, `abilities.json` |

Os valores são os **originais da ROM**, sem nenhum ajuste de balanceamento. Identificadores de
efeito, método de evolução e uso de item são guardados crus, para o combate mapeá-los depois.
Nomes e descrições não estão aqui: cada registro só aponta para o catálogo de textos. O formato de
cada arquivo está em [data-model.md](specs/004-game-data-extraction/data-model.md).

Para conferir uma extração, rode o **relatório de sanidade** (precisa dos arquivos já
extraídos, não da ROM):

```powershell
npm run extract -- --out assets --report
```

Ele valida cada arquivo contra o schema, confere as contagens esperadas (493 espécies, 467 golpes
etc.) e lista valores fora de faixa. Falha (código 1) se um arquivo faltar ou for inválido ou se
uma contagem não fechar; valores fora de faixa só geram alertas. O relatório é local: a
integração contínua não o executa.

## Textos

O extrator converte os textos do jogo (diálogos, nomes, menus) para um catálogo de inglês, em
`stages/text-catalog/catalog/en/NNNN.json` (um arquivo por banco). Cada texto usa uma marcação
neutra e documentada em [contrato da marcação](specs/005-text-catalog/contracts/markup.md):

- `{n}` quebra de linha, `{page}` espera e nova página, `{scroll}` espera e rola;
- `{trainer-name:0}`, `{pokemon-name:1}` e outras variáveis, com o slot que o script preenche;
- `{color:N}` cor, e `{raw:XXXX}` para o que a tabela ainda não nomeia.

Para buscar um trecho e descobrir o identificador dele:

```powershell
npm run extract -- --out assets --find "new bark town"
npm run extract -- --out assets --find "photo" --limit 5
```

O `--report` ganha a seção "Textos" (contagens, ida e volta e referências de nome).

**Dívida conhecida**: alguns símbolos (glifos de botão, japonês) ainda aparecem como `{raw:…}`. Veja
[tech-debt.md](specs/005-text-catalog/tech-debt.md).

## Mapas

A etapa `maps` converte os mapas em camadas pré-renderizadas (chão e o que fica acima do jogador)
e em colisão por nível, em `stages/maps/maps/`. Cada mapa tem uma pasta com `layers/` e
`collision/`, e o `report.json` lista cada mapa como sucesso, sucesso com avisos ou falha, com o
motivo. Mapas com textura animada ou comportamento de tile sem categoria aparecem no `--report`.

```powershell
npm run extract -- --out assets --stages maps --force maps
npm run extract -- --out assets --report
npm run maps:view -- 60 --out assets
```

O visualizador abre no navegador, em `127.0.0.1`, e serve só leitura. Ele alterna nível, camadas
(chão e acima do jogador) e a colisão colorida por categoria, com legenda. O identificador do mapa
é o índice do header (o mesmo que o relatório mostra).

**Animações**: os mapas com água, moinhos e outras texturas animadas ganham um `animations.json` e quadros
(`layers/*-anim-K.png`, só a região que muda). O visualizador tem o botão **Animar**. O ciclo é
reamostrado em 8 quadros, então a velocidade real não é preservada.

**Limitações desta versão**: a rotação de textura não é tocada. Mapas que nenhuma matriz coloca no mundo falham com o motivo indicado.
Veja o [plano](specs/006-map-prerender/plan.md) e a [pesquisa](specs/006-map-prerender/research.md).

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
