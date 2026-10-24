# Quickstart: LAN, sessões e saves

## Pré-requisitos

- Assets extraídos (feature 003+). `npm install` na raiz.
- Para os cenários de LAN: 2–4 PCs Windows na mesma rede com o mesmo build.

## Testes automatizados

```sh
npm test -w @soulsilver/shared   # schema, coerência, migração, codec do anúncio
npm test -w @soulsilver/server   # nome único, invalid-save, reserva/resume, save periódico e final
npm test -w @soulsilver/app      # save-store: atômico, .bak, corrupção, restaurar, export/import
```

## Cenários manuais

| # | Passos | Esperado | Cobre |
|---|--------|----------|-------|
| 1 | Novo jogo "Gold" no slot 1, Jogar sozinho, andar, sair, reabrir app | Continuar mostra Gold na nova posição | US1, US2, US3 |
| 2 | Com sessão solo aberta, outro PC abre Entrar e tenta o IP | Não aparece; conexão recusada | SC-007 |
| 3 | Hospedar pela 1ª vez | Explicação antes do prompt do Windows; na 2ª vez, sem explicação | FR-014 |
| 4 | Host + 3 PCs abrem Entrar, cronometrar | Partida em ≤ 5 s; os 3 entram | SC-001 |
| 5 | Convidado com build de outra versão | Partida desabilitada com motivo | FR-016 |
| 6 | Entrar por IP digitado | Conecta | FR-017 |
| 7 | Editar `slot-N.json` com `x` fora do mapa / nível 500 no schema de teste; entrar | Recusa com motivo | SC-004 |
| 8 | Dois convidados com nome "Gold" | Segundo recusado: nome em uso | FR-019 |
| 9 | Convidado anda, desliga o Wi-Fi 30 s, religa, Entrar de novo | Volta na posição de antes da queda | SC-002 |
| 10 | Host encerra a partida | Convidados voltam ao menu; saves com a posição final | FR-021 |
| 11 | Truncar `slot-1.json` à mão; abrir Continuar | Slot "corrompido"; restaurar backup funciona | SC-003 |
| 12 | Matar o processo durante gravação (loop de warps) | Slot abre (atual ou `.bak`) | SC-005 |
| 13 | Exportar slot 1, importar no slot 2 de outro PC | Continua o jogo | US7 |
