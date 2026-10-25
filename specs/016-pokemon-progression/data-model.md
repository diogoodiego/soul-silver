# Data Model: Progressão dos Pokémon

## PartyMember (estende o do spec 14/15)

| Campo | Tipo | Regra |
|---|---|---|
| `experience` | int ≥ 0 | XP total; o nível é derivado dela pela curva da espécie (coerência: `level` = nível da curva) |
| `ivs` | `Stats` 0–31 | fixos desde o spawn |
| `evs` | `Stats` 0–255 | soma ≤ 510 |
| `nature` | int 0–24 | id em `natures.json` |
| `friendship` | int 0–255 | já existia; agora com regras (research R7) |
| `species`, `level`, `moves`, `hp`, `shiny` | — | como antes; `hp` ≤ HP máximo calculado |

Os stats não são guardados: saem de `computeStats(base, level, { ivs, evs, nature })`.

## ProgressionItem (fila)

```text
{ kind: "level-up", member, level }                     // automático, só exibido (stats e ganhos vão na mensagem)
{ kind: "learn", member, move }                         // automático se < 4 golpes; prompt se 4
{ kind: "evolve", member, into }                        // prompt cancelável
```

`member` é o índice da equipe. A fila (`pending: ProgressionItem[]`) fica no save e só guarda
itens ainda não resolvidos.

## Estados

```text
combate ativo ──queda──▶ credita XP/EVs, adiciona itens à fila
combate termina ──▶ resolve itens em ordem:
   level-up / learn com vaga → aplica, avisa, próximo
   learn com 4 golpes → prompt ── forget(i) | skip ──▶ próximo
   evolve → prompt (animação) ── confirm | cancel ──▶ próximo
fila vazia ──▶ pode iniciar combate de novo
```

## Participação (só no servidor, não persistida)

`Map<wildId, Map<playerId, Set<partyIndex>>>`, preenchido quando um membro fica ativo no combate e
apagado quando o selvagem some.

## Validação

- A ordem dos itens segue research R5; um `learn` de golpe já conhecido não entra na fila.
- Uma resposta a um prompt que não é o primeiro da fila é ignorada.
- A coerência do save garante `level` igual ao nível da curva para `experience`. Ela só roda quando
  os dados de jogo estão carregados (servidor), porque o schema puro não conhece as curvas.
