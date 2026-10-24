# Quickstart: validação de mapas pré-renderizados

**Feature**: [spec.md](./spec.md) | **Plano**: [plan.md](./plan.md) | **Contrato**: [contracts/map-api.md](./contracts/map-api.md)

Roteiro para validar a feature de ponta a ponta. A ROM real nunca entra nos testes; estes passos
usam a ROM do desenvolvedor apenas na conferência manual.

## Pré-requisitos

- Node.js 24 LTS e dependências instaladas (`npm install`).
- A ROM do SoulSilver (EUA) já extraída pela 003 e pelas etapas 004 e 005.
- Verificação dos formatos (R0) concluída e registrada.

## 1. Testes automatizados

```bash
npm run test -w @soulsilver/shared
npm run test -w @soulsilver/extractor
```

Esperado: todos os testes de `maps` passam. Os fixtures são sintéticos (`test/fixtures/maps/`).

## 2. Typecheck e lint

```bash
npm run typecheck
npm run lint
```

Esperado: sem erros.

## 3. Extração dos mapas

```bash
npm run extract -- --stage maps
```

Esperado:

- `stages/maps/report.json` lista todos os mapas com `status`;
- ao menos 95% dos mapas têm `status` diferente de `failure` (SC-002);
- toda falha tem `reason` preenchido.

## 4. Conferência tile a tile (SC-003)

Para qualquer mapa, cada PNG de camada tem `width = tilesX × 16` e `height = tilesY × 16`, e
cada arquivo de colisão tem uma célula por tile. O teste automatizado já cobre isso com dados
sintéticos; a conferência manual confirma com a ROM real.

## 5. Visualizador

```bash
npm run maps:view -- new-bark-town
```

Abre o navegador em `http://127.0.0.1:<porta>/`.

Conferência manual dos quatro mapas do SC-001:

1. New Bark Town: reconhecível, caminhos e casas no lugar certo.
2. Route 29: reconhecível, grama alta marcada.
3. Cherrygrove City: reconhecível, água e saída para a rota marcadas.
4. Uma caverna com níveis sobrepostos: a ponte aparece sobre o caminho; a transição entre níveis
   está marcada.

Para cada mapa: alternar `lower` e `upper`, ligar a colisão e confirmar que as cores batem com
a categoria (bloqueado, livre, grama alta, água, ressalto, escada, transição, especial).

## 6. Reexecução determinística (SC-006)

```bash
npm run extract -- --stage maps
```

Rodar duas vezes e comparar os arquivos de `stages/maps/` (hash). Esperado: saída idêntica.

## Resultado esperado

Todos os passos acima concluídos, com a conferência manual dos quatro mapas registrada no
relatório da feature (`checklists/` ou nota no PR).
