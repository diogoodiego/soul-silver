# Data Model: Dados do jogo

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

Os schemas ficam em `packages/shared/src/game-data/` (zod, R12). Os tipos TypeScript são
`z.infer` dos schemas. Os nomes de campo ficam em inglês (código); as descrições, em PT-BR.

## Envelope comum

Todo arquivo de dados tem a forma:

```ts
interface GameDataFile<K extends GameDataKind, R> {
  kind: K;               // ex.: "moves"
  formatVersion: 1;      // FR-015; mudar o formato = subir este número
  records: R[];          // ordenados por id, sem duplicatas
}

type GameDataKind =
  | "species" | "moves" | "learnsets" | "machines" | "tutors" | "evolutions" | "items"
  | "types" | "type-chart" | "natures" | "growth-rates" | "abilities";
```

Regras comuns: ids inteiros ≥ 0; `records` ordenado por id, sem repetição; nenhum campo extra
(objetos estritos).

```ts
/** Referência ao catálogo de textos do spec 5 (FR-011). */
interface TextRef { catalog: "species-names" | "move-names" | "item-names" | "ability-names" | "type-names" | "nature-names"; index: number }

type StatKey = "hp" | "attack" | "defense" | "speed" | "specialAttack" | "specialDefense";
type Stats = Record<StatKey, number>;   // sempre nesta ordem de chaves
```

## species.json (`data-species`)

Um registro por espécie (1–493) e por forma com dados próprios (índice personal 496–507).

```ts
interface SpeciesRecord {
  id: number;                     // índice personal: 1–493 = nº nacional; 496–507 = formas
  species: number;                // nº nacional (igual a id nas espécies base)
  form: number;                   // 0 = base; 1..n = forma alternativa
  name: TextRef;                  // { catalog: "species-names", index: species }
  baseStats: Stats;               // 0–255 cada
  types: [number] | [number, number];         // ids de tipo; um só quando os dois bytes são iguais
  abilities: [number] | [number, number];     // ids de habilidade; sem a segunda quando 0
  catchRate: number;              // 0–255
  baseExperience: number;         // 0–255
  evYield: Stats;                 // 0–3 cada
  gender: { kind: "male-only" | "female-only" | "genderless" | "mixed"; raw: number };  // raw 0–255
  growthRate: GrowthRateKey;
  eggGroups: [EggGroupKey] | [EggGroupKey, EggGroupKey];
  heldItems: { common: number | null; rare: number | null };   // ids de item; null quando 0
  hatchCycles: number;
  baseFriendship: number;
  safariFleeRate: number;
  color: { id: number; flip: boolean };
  forms: number[];                // só na espécie base: ids dos registros de forma (ex.: Deoxys → [496, 497, 498])
}

type GrowthRateKey = "medium-fast" | "erratic" | "fluctuating" | "medium-slow" | "fast" | "slow";
type EggGroupKey = "monster" | "water-1" | "bug" | "flying" | "field" | "fairy" | "grass" | "human-like"
  | "water-3" | "mineral" | "amorphous" | "water-2" | "ditto" | "dragon" | "undiscovered";
```

`gender.kind`: raw 0 → `male-only`, 254 → `female-only`, 255 → `genderless`, outros → `mixed`.
Um registro de forma tem `forms: []`. Ovo e Ovo ruim (494–495) não entram.

## moves.json (`data-moves`)

Um registro por golpe, ids 1–467.

```ts
interface MoveRecord {
  id: number;
  name: TextRef;                  // move-names
  type: number;
  category: "physical" | "special" | "status";
  power: number;                  // cru: 0 = sem dano, 1 = variável/calculado
  accuracy: number | null;        // null = sem checagem de precisão (cru 0); esperado 1–100 (o relatório alerta fora disso)
  pp: number;
  priority: number;               // −128..127 cru (esperado −7..5)
  target: MoveTargetKey;
  targetRaw: number;
  flags: { contact: boolean; protect: boolean; magicCoat: boolean; snatch: boolean;
           mirrorMove: boolean; kingsRock: boolean; keepHpBar: boolean; hideShadow: boolean };
  flagsRaw: number;
  effect: { id: number; chance: number };   // identificador original e chance (%), sem interpretação (FR-004)
  contest: { effect: number; type: number };
}

type MoveTargetKey = "selected" | "depends" | "random" | "both-foes" | "all-others" | "user"
  | "user-side" | "field" | "foe-side" | "ally" | "user-or-ally" | "foe" | "unknown";
```

## learnsets.json, machines.json, tutors.json (`data-learnsets`)

```ts
interface LearnsetRecord {
  id: number;                     // mesmo id de SpeciesRecord (espécies e formas: 505 registros)
  levelUp: { level: number; move: number }[];   // ordem original; nível 0–127 no schema, esperado 1–100 (alerta)
  machines: number[];             // ids de MachineRecord compatíveis, crescentes
  egg: number[];                  // ids de golpe; [] para formas e espécies sem golpes de ovo
  tutors: number[];               // ids de TutorRecord compatíveis, crescentes
}

interface MachineRecord {
  id: number;                     // 1–100: TM01–TM92 = 1–92, HM01–HM08 = 93–100
  kind: "tm" | "hm";
  number: number;                 // 1–92 (TM) ou 1–8 (HM)
  move: number;
}

interface TutorRecord {
  id: number;                     // 0–51, ordem do jogo (bit da compatibilidade)
  move: number;
  cost: number;                   // BP; 0 = gratuito
  area: number;                   // identificador original do local/tutor
}
```

## evolutions.json (`data-evolutions`)

Um registro por espécie ou forma **que evolui**. As entradas vazias (método 0) são omitidas.

```ts
interface EvolutionRecord {
  id: number;                     // id do SpeciesRecord de origem
  evolutions: {
    method: EvolutionMethodKey;   // tabela de research R6
    methodId: number;             // identificador original (FR-006)
    parameter: number;            // cru
    condition:                    // interpretação do parâmetro conforme o método
      | { kind: "none" } | { kind: "level"; level: number } | { kind: "item"; item: number }
      | { kind: "move"; move: number } | { kind: "species"; species: number }
      | { kind: "beauty"; minimum: number } | { kind: "raw"; value: number };
    into: number;                 // nº nacional de destino
  }[];                            // ordem original
}
```

## items.json (`data-items`)

Um registro por id de item válido: 1–536, sem os 23 que apontam para o dado 0 (513 registros).

```ts
interface ItemRecord {
  id: number;                     // id do item no jogo
  dataIndex: number;              // membro de a/0/1/7 (rastreabilidade)
  name: TextRef;                  // item-names
  price: number;
  pocket: "items" | "medicine" | "balls" | "machines" | "berries" | "mail" | "battle-items" | "key-items";
  battlePockets: number;          // bitfield cru
  holdEffect: { id: number; parameter: number };
  fling: { effect: number; power: number };
  naturalGift: { power: number; type: number };   // type cru (31 = nenhum)
  pluckEffect: number;
  preventToss: boolean;
  selectable: boolean;
  fieldUse: number;               // função de uso no campo (id original)
  battleUse: number;              // função de uso no combate (id original)
  partyUse: { kind: number; params: string };     // params: 20 bytes em hex minúsculo (40 caracteres)
}
```

## types.json, type-chart.json (`data-tables`)

```ts
interface TypeRecord { id: number; key: TypeKey; name: TextRef }   // 0–17; TypeKey é a chave legível ("fire", "unknown" para o 9)

interface TypeChartRecord {
  id: number;                     // id do tipo atacante
  against: number[];              // 18 valores em décimos (0, 5, 10, 20), índice = id do defensor
}
// O arquivo type-chart.json tem, além de records, o campo
//   foresightIgnored: { attacker: number; defender: number }[]
// (pares que Foresight e Odor Sleuth anulam, na ordem original).
```

## natures.json, growth-rates.json, abilities.json (`data-tables`)

```ts
interface NatureRecord {
  id: number;                     // 0–24
  name: TextRef;                  // nature-names
  increased: Exclude<StatKey, "hp"> | null;     // null nas neutras
  decreased: Exclude<StatKey, "hp"> | null;
}

interface GrowthRateRecord {
  id: number;                     // 0–5
  key: GrowthRateKey;
  experience: number[];           // exatamente 100 valores: experiência total para os níveis 1..100; o relatório alerta se decrescer
}

interface AbilityRecord { id: number; name: TextRef }   // 1–123
```

## Validação

**O que o schema exige e o que o relatório avisa.** O schema exige a forma (campos, tipos,
enums, ordem dos ids) e os limites do próprio byte ou palavra lido (por exemplo, 0–255 para um
byte). As faixas do jogo (precisão 1–100, PP 1–40, prioridade −7 a 5, stat base 1–255, nível de
learnset 1–100, curva de experiência crescente) **não** estão no schema: valores fora delas são
gravados como estão e aparecem como alertas no relatório de sanidade (FR-018, FR-020). Assim a
extração só falha quando o dado não pode ser lido.

- **Na geração** (FR-013): cada etapa chama `parseGameDataFile(kind, value, fileName)` antes de
  gravar. Uma falha lança um erro, e o pipeline (feature 003) marca a etapa como `stage-failed`.
- **No carregamento** (FR-014): o mesmo `parseGameDataFile` devolve
  `{ ok: true, data } | { ok: false, error: { file, path, problem } }`.
- **Referências entre arquivos**: não fazem parte do schema (cada arquivo é validado sozinho) e
  ficam no relatório de sanidade.

## Relatório de sanidade

```ts
interface SanityReport {
  ok: boolean;                    // false se algum arquivo falhar ou alguma contagem não fechar
  files: { kind: GameDataKind; file: string; status: "ok" | "missing" | "invalid"; error?: { path: string; problem: string } }[];
  counts: { name: string; expected: number; actual: number; ok: boolean }[];
  warnings: { kind: GameDataKind; recordId: number; field: string; value: string; expected: string }[];
  ignored: { kind: GameDataKind; detail: string }[];   // ex.: golpes 468–470, curvas 6–7, itens não usados
}
```

Contagens esperadas e faixas: [research R15](./research.md#r15-relatório-de-sanidade).
