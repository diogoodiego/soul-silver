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
