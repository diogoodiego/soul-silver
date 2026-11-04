// The golden path's milestones (spec 024 US6, contracts/golden-path.md): what the player's save holds at each one.
// The ids come from the extracted scripts, checked against pret/pokeheartgold (research R7).
import { badgeCount, type Save } from "@soulsilver/shared/save";

export interface Checks {
  map?: number;
  flags?: number[];
  vars?: Record<number, number>;
  party?: number;
  /** Minimum count in the bag; 0 means the item is gone. */
  items?: Record<number, number>;
  rivalNamed?: boolean;
  /** One of these trainers defeated (the rival's team depends on the starter). */
  beaten?: number[];
  /** Minimum. */
  badges?: number;
}

export interface Milestone {
  n: number;
  name: string;
  checks: Checks;
}

/** What a milestone is checked against: the latest save and the current map's duplicated objects (research R8). */
export interface Progress {
  save: Save;
  duplicates: number[][];
  /** Trainer t's defeated flag is this plus t (content/trainer/tuning.json). */
  trainerFlagBase?: number;
}

export const hex = (id: number) => `0x${id.toString(16)}`;
const count = (save: Save, item: number) => save.bag.find((b) => b.item === item)?.count ?? 0;

/** The first check that does not hold, as text; undefined when the milestone is reached. */
export function failedCheck({ checks: c }: Milestone, { save, duplicates, trainerFlagBase = 0 }: Progress): string | undefined {
  if (c.map !== undefined && save.area !== String(c.map)) return `mapa ${c.map} (está ${save.area})`;
  for (const flag of c.flags ?? []) if (!save.flags.includes(flag)) return `flag ${flag} ligada`;
  for (const [id, value] of Object.entries(c.vars ?? {})) {
    const now = save.vars[id] ?? 0;
    if (now !== value) return `var ${hex(Number(id))} = ${value} (está ${now})`;
  }
  if (c.party !== undefined && save.party.length !== c.party) return `time com ${c.party} Pokémon (tem ${save.party.length})`;
  for (const [id, min] of Object.entries(c.items ?? {})) {
    const now = count(save, Number(id));
    if (min === 0 && now > 0) return `item ${id} fora da bolsa (tem ${now})`;
    if (now < min) return `item ${id} × ${min} na bolsa (tem ${now})`;
  }
  if (c.badges !== undefined && badgeCount(save.badgeSet) < c.badges) return `insígnias ≥ ${c.badges} (tem ${badgeCount(save.badgeSet)})`;
  if (c.rivalNamed && save.rivalName === "") return "rival com nome";
  if (c.beaten && !c.beaten.some((t) => save.flags.includes(trainerFlagBase + t))) return `treinador ${c.beaten.join(", ").replace(/, (\d+)$/, " ou $1")} vencido`;
  const twice = duplicates[0];
  if (twice) return `nenhum personagem duplicado (objetos ${twice.join(" e ")})`;
  return undefined;
}

/** The ten milestones, in the order the game allows (research R7, walkthrough). */
export const MILESTONES: Milestone[] = [
  // 960 from NewGame_InitSaveData; 418, 678 and 744 from the init script (research R1).
  { n: 1, name: "Jogo novo no quarto", checks: { map: 64, flags: [418, 678, 744, 960] } },
  // VAR_SCENE_PLAYERS_HOUSE_1F, set by 845:0.
  { n: 2, name: "Cena da mãe concluída", checks: { vars: { 0x4106: 1 } } },
  // FLAG_GOT_STARTER and VAR_SCENE_ELMS_LAB, set by 843:12.
  { n: 3, name: "Inicial recebido", checks: { party: 1, flags: [106], vars: { 0x4108: 1 } } },
  // GiveRunningShoes stores nothing here (running is always on): the guide's scene, 850:1 then 850:2, sets VAR_SCENE_CHERRYGROVE_CITY_OW.
  { n: 4, name: "Running Shoes", checks: { vars: { 0x4073: 2 } } },
  // The Mystery Egg is key item 484; FLAG_GOT_POKEDEX; 229:1.
  { n: 5, name: "Mystery Egg e Pokédex", checks: { items: { 484: 1 }, flags: [107], vars: { 0x4107: 1, 0x4108: 3, 0x4073: 3 } } },
  // The rival's battle (850:3) sets 0x4073 = 4; the officer in the lab (843:2) names them and sets FLAG_GAVE_RIVAL_NAME_TO_OFFICER.
  { n: 6, name: "Rival vencido e nomeado", checks: { vars: { 0x4073: 4 }, flags: [121], rivalNamed: true, beaten: [495, 496, 497] } },
  // The same scene takes the egg (TakeItem 484) and moves the lab and Route 29 on.
  { n: 7, name: "Ovo entregue ao Elm", checks: { items: { 484: 0 }, vars: { 0x4108: 4, 0x408b: 1 } } },
  // 225:1: five Poké Balls (item 4) and FLAG_WATCHED_CATCHING_TUTORIAL.
  { n: 8, name: "Poké Balls do tutorial", checks: { items: { 4: 5 }, flags: [154] } },
  // 18:2: Li's battle (trainer 290), then HM05 (item 397) and flag 118.
  { n: 9, name: "Sprout Tower concluída", checks: { flags: [118], items: { 397: 1 }, beaten: [290] } },
  // 859:1: Falkner (trainer 20), the Zephyr Badge, flag 402 and VAR_SCENE_VIOLET_CITY_OW.
  { n: 10, name: "Falkner e Insígnia Zephyr", checks: { badges: 1, flags: [402], vars: { 0x4074: 1 }, beaten: [20] } },
];
