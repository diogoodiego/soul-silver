# Marco 7: Polimento e lançamento

Prompts dos itens pendentes, exportados do documento do roadmap. Não edite à mão: o plano muda no documento e este arquivo é exportado de novo.

## Polimento

### P.1 Balanceamento global

Item P.1 do roadmap (Marco 7): Balanceamento global.
Fazer: revisar o docs/balance-log.md inteiro, rodar o bot de referência do início do jogo até o Red e ajustar a curva de dificuldade do combate em tempo real, mudando só valores em dados e registrando cada ajuste.
Pronto quando: o bot completa o jogo inteiro e nenhum trecho tem pico de dificuldade fora da faixa definida no balance-log.

Regras do item:
- Depende de: Marcos 0 a 6 concluídos.
- Antes de ajustar, mostre a curva atual (taxa de vitória por trecho) e a lista de ajustes propostos com o motivo de cada um.

Verificação: completa (CLAUDE.md), e depois o caminho dourado completo com o bot. No fim, mostre a curva antes e depois e as entradas novas do balance-log.

### P.2 Desempenho

Item P.2 do roadmap (Marco 7): Desempenho.
Fazer: perfilar cliente e servidor com 4 jogadores nas áreas mais pesadas (cidades grandes, lutas com muitos golpes simultâneos) e corrigir os gargalos encontrados.
Pronto quando: 60 fps num PC modesto e o tick do servidor dentro do orçamento de 20 Hz nas áreas medidas.

Regras do item:
- Meça antes de otimizar. Antes de editar, mostre os gargalos medidos.
- Não mude comportamento de jogo para ganhar desempenho sem me perguntar.

Verificação: leve (CLAUDE.md), incluindo os testes de desempenho existentes, e as medições antes e depois. No fim, mostre as medições e liste o que mudou.

### P.3 Acessibilidade

Item P.3 do roadmap (Marco 7): Acessibilidade.
Fazer: opções nas Configurações para tamanho do texto, cores alternativas para daltonismo nos indicadores de combate (efetividade, status, alcance de golpes) e redução de efeitos de tela (tremor, flashes).
Pronto quando: cada opção tem captura antes e depois em .evidence/P/ e persiste depois de reabrir o app.

Regras do item:
- Textos novos passam pela estrutura de i18n.

Verificação: leve (CLAUDE.md), e depois o roteiro de capturas pela skill run-soulsilver. No fim, diga o que cada captura mostra.

### P.4 Configurações e textos

Item P.4 do roadmap (Marco 7): Configurações e textos.
Fazer: revisar todas as configurações e todos os textos da interface, listar as chaves de i18n sem tradução ou sem uso e corrigi-las, e conferir que cada configuração persiste.
Pronto quando: nenhuma chave de i18n faltando ou órfã, e todas as configurações persistem depois de reabrir o app.

Regras do item:
- Antes de editar, mostre a lista de problemas encontrados.
- Pergunte antes de remover uma configuração.

Verificação: leve (CLAUDE.md), incluindo um teste que falha com chaves de i18n faltando. No fim, liste o que foi corrigido.

## Lançamento

### L.1 Instalação e primeira execução

Item L.1 do roadmap (Marco 7): Instalação e primeira execução.
Fazer: escrever um roteiro para eu testar num PC Windows limpo (instalar pelo instalador do GitHub Releases, passar pelo aviso do SmartScreen, escolher a ROM, extrair e chegar ao jogo), e corrigir os atritos que eu relatar ou que o roteiro revelar no app.
Pronto quando: o caminho completo leva menos de 15 minutos sem ajuda.

Regras do item:
- Depende de: itens P.1 a P.4 concluídos.
- Entregue o roteiro primeiro e espere meu relato antes de corrigir.
- Pergunte antes de mudar o pipeline de build.

Verificação: leve (CLAUDE.md) depois de cada correção. No fim, liste o que foi corrigido.

### L.2 Teste em LAN com 4 PCs

Item L.2 do roadmap (Marco 7): Teste em LAN com 4 PCs.
Fazer: escrever o roteiro de uma sessão de 2 horas com 4 jogadores em PCs diferentes (descoberta, troca, duelo, caça conjunta e quedas de conexão provocadas), e depois corrigir os problemas que eu relatar, usando os logs do app.
Pronto quando: a sessão dura pelo menos 2 horas sem perda de progresso e os problemas relatados estão corrigidos.

Regras do item:
- Entregue o roteiro primeiro e espere meu relato antes de corrigir.
- Para cada problema relatado, escreva primeiro um teste de harness que o reproduz.

Verificação: leve (CLAUDE.md) depois de cada correção. No fim, liste os problemas, os testes que os reproduzem e as correções.

### L.3 Versão 1.0

Item L.3 do roadmap (Marco 7): Versão 1.0.
Fazer: preparar as notas da versão 1.0 a partir do histórico, conferir que o pacote final não contém ROM nem assets (npm run check:assets e a verificação do pacote) e deixar pronta a tag para publicação pelo pipeline do spec 002.
Pronto quando: as notas estão escritas, as verificações de assets passam e eu confirmei a criação da tag; depois da publicação, o auto-update leva uma versão anterior até a 1.0.

Regras do item:
- Nunca crie a tag nem publique sem minha confirmação explícita.
- Pergunte antes de mudar o pipeline de build.

Verificação: completa (CLAUDE.md), mais npm run check:assets. No fim, mostre as notas da versão e o resultado de cada verificação, e peça minha confirmação para criar a tag.
