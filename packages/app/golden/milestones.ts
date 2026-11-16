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
  /** Pokégear contacts registered. */
  contacts?: number[];
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
  for (const id of c.contacts ?? []) if (!save.phone.contacts.includes(id)) return `contato ${id} no Pokégear`;
  if (c.rivalNamed && save.rivalName === "") return "rival com nome";
  if (c.beaten && !c.beaten.some((t) => save.flags.includes(trainerFlagBase + t))) return `treinador ${c.beaten.join(", ").replace(/, (\d+)$/, " ou $1")} vencido`;
  const twice = duplicates[0];
  if (twice) return `nenhum personagem duplicado (objetos ${twice.join(" e ")})`;
  return undefined;
}

/** The milestones, in the order the game allows (research R7, walkthrough). */
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
  // Spec 030.1. Out of the gym: Violet City's frame (0x4074 = 1) plays Elm's call, 857:0 (FLAG_GOT_PICK_UP_EGG_CALL_FROM_ELM).
  { n: 11, name: "Ligação do Elm ao sair do ginásio", checks: { flags: [159], vars: { 0x4074: 2 } } },
  // 858:2, the assistant in the Violet Poké Mart: GiveTogepiEgg, FLAG_GOT_EGG_FROM_ELMS_ASSISTANT; the lab moves on.
  { n: 12, name: "Ovo de Togepi do assistente", checks: { flags: [112], vars: { 0x4074: 3, 0x4108: 7 } } },
  // Out of the mart: the frame (0x4074 = 3) plays the Kimono Girl's scene, 857:4, which hides her again (568).
  { n: 13, name: "Kimono Girl na saída do Poké Mart", checks: { flags: [568], vars: { 0x4074: 4 } } },
  // The egg hatches by walking (spec 029.4); the assistant's Togepi sets FLAG_SYS_HATCHED_TOGEPI_EGG.
  { n: 14, name: "Togepi eclodido", checks: { flags: [0x983] } },
  // 843 L32: Elm sees Togepi in the lead and gives the Everstone (item 229), FLAG_GOT_EVERSTONE_FROM_ELM.
  { n: 15, name: "Everstone do Elm", checks: { flags: [114], items: { 229: 1 } } },
  // Spec 030.2. Route 32's north trigger (232:2, VAR_SCENE_ROUTE_32 = 0): with the egg taken, the man walks up and gives the Miracle Seed (item 239, flag 116).
  { n: 16, name: "Miracle Seed na Rota 32", checks: { flags: [116], items: { 239: 1 }, vars: { 0x408d: 1 } } },
  // 233:1, the fisherman in Route 32's Pokémon Center: the Old Rod (item 445, flag 117).
  { n: 17, name: "Old Rod no Centro Pokémon da Rota 32", checks: { flags: [117], items: { 445: 1 } } },
  // Union Cave 1F (map 99) from Route 32's south entrance to its exit onto Route 33.
  { n: 18, name: "Union Cave até a Rota 33", checks: { map: 37 } },
  // Spec 030.3. Ruins of Alph's first visit: Route 32's gate (98), the outside (113), then the Research Center (321), whose director meets the player (38:0, flag 271).
  { n: 19, name: "Ruins of Alph e o centro de pesquisa", checks: { map: 321, flags: [271] } },
  // Dark Cave from Route 31 (map 176), the part reached before Flash, Rock Smash and Surf.
  { n: 20, name: "Dark Cave pela Rota 31", checks: { map: 176 } },
  // Spec 030.4. Azalea's trigger at (434, 466) (866:3, VAR_SCENE_AZALEA_TOWN = 0): the Rockets' scene; the well's guard shows (415 cleared).
  { n: 21, name: "Rockets na chegada a Azalea", checks: { map: 74, vars: { 0x4080: 1 }, flags: [625, 626] } },
  // 874:1, Kurt in his house (map 164): he runs off to the well; FLAG_TALKED_TO_KURT (119), Kurt (414) and the guard (415) hidden.
  { n: 22, name: "Kurt corre para o Slowpoke Well", checks: { flags: [119, 414, 415] } },
  // 60:2, Proton (trainer 486) in the well's B1F: the Rockets leave (425, which also hides the one at the gym door), FLAG_CLEARED_SLOWPOKE_WELL (123);
  // back in Kurt's house the frame 0x4080 = 2 plays 874:5: the Fast Ball (item 492, flag 124), then his granddaughter's Kurt number (contact 5).
  { n: 23, name: "Slowpoke Well, Fast Ball e telefone do Kurt", checks: { map: 164, flags: [123, 124, 425], items: { 492: 1 }, vars: { 0x4080: 4 }, beaten: [486], contacts: [5] } },
  // The Rocket at the gym door (person 1 of map 74, hide flag 425) is gone: the door (405, 471) leads into the gym's entrance (map 136).
  { n: 24, name: "Ginásio de Azalea liberado", checks: { map: 136 } },
  // Spec 030.5: the gym (map 180) by its Spinarak threads and levers (azalea-gym.json), to the tile below Bugsy; the step checks each ride.
  { n: 25, name: "Ginásio de Azalea: Spinarak até o Bugsy", checks: { map: 180 } },
  // Spec 030.6. 869:1, Bugsy (trainer 21): the Hive Badge (badge 1), the gym's trainers marked beaten, then the std 2033 gift
  // of item 416 (0x8004) and FLAG_GOT_TM49_FROM_BUGSY (127).
  { n: 26, name: "Bugsy e Insígnia Hive", checks: { badges: 2, flags: [127], items: { 416: 1 }, beaten: [21] } },
  // 866:2, the trigger at Azalea's west exit (x 395, armed by Proton's 60:2 setting 0x4075 = 1): the rival's battle by the
  // player's starter (266 Chikorita, 269 Cyndaquil, 1 Totodile), then 0x4075 = 2.
  { n: 27, name: "Rival na saída de Azalea", checks: { map: 74, vars: { 0x4075: 2 }, beaten: [266, 269, 1] } },
  // Spec 030.7. Ilex Forest (map 117, scr_seq 92): the Farfetch'd at (25, 62) faces the branch at (25, 66) once stepped on (92:3),
  // then caught from behind, from the north (92:1 L28): flag 125, its hide flag 423, and back by the apprentice.
  { n: 28, name: "Primeiro Farfetch'd do Ilex", checks: { map: 117, flags: [125, 423] } },
  // The one at (41, 54) flees east from the front, faces the branch at (52, 53) (92:7), and is caught from the west (92:5 L74);
  // with both back, the charcoal man (92 L142) gives HM01 (item 420, std 2033) and FLAG_GOT_HM01 (128).
  { n: 29, name: "Segundo Farfetch'd e HM01 Cut", checks: { map: 117, flags: [126, 424, 128], items: { 420: 1 } } },
  // The tree at (16, 62) (person 5, 146:0) is the only way north: Cut, then the forest's north exit into Route 34's gate (map 171).
  { n: 30, name: "Travessia do Ilex com Cut", checks: { map: 171 } },
  // Spec 030.8. Route 34 north: the trigger at (365–371, 413) (237:3, VAR 0x408E = 0) spans the way, the friend's Day-Care
  // scene plays on it; then north into Goldenrod City (map 76).
  { n: 31, name: "Rota 34 até Goldenrod", checks: { map: 76 } },
  // 890:0, the bike shop (map 182): "yes" twice, the Bicycle (item 450, std 2033) and flag 137.
  { n: 32, name: "Bicicleta da loja de Goldenrod", checks: { flags: [137], items: { 450: 1 } } },
  // 29:2, the quiz at the Radio Tower 1F (map 112): five right answers give the Radio Card (flag 138); Whitney, watching, runs
  // back to her gym and flag 792 hides the girl blocking its door (person 20 of Goldenrod).
  { n: 33, name: "Radio Card no quiz da Torre de Rádio", checks: { flags: [138, 792] } },
  // The gym (map 137) by its maze: its four trainers (5, 22, 70, 71, each checked on the way), then the tile below Whitney at (13, 4).
  { n: 34, name: "Ginásio de Goldenrod: labirinto até a Whitney", checks: { map: 137, vars: { 0x410a: 0 } } },
  // 886:0, Whitney (trainer 30): she cries instead of handing the badge (886 L15): VAR 0x410A = 1, flag 132.
  { n: 35, name: "Whitney vencida e chorando", checks: { flags: [132], vars: { 0x410a: 1 }, beaten: [30] } },
  // The trigger at (13, 11) (886:1, VAR 0x410A = 1): the girl stops the player (flag 183); Whitney spoken to again gives the
  // Plain Badge (badge 2), VAR 0x410A = 2, then TM45 (item 372, std 2033) and flag 133.
  { n: 36, name: "Whitney de novo e Insígnia Plain", checks: { badges: 3, flags: [183, 133], vars: { 0x410a: 2 }, items: { 372: 1 } } },
  // Spec 030.9. 896:0, the Goldenrod flower shop (map 184): with the Plain Badge (badge 2) the SquirtBottle (item 477, std 2033).
  { n: 37, name: "SquirtBottle da floricultura de Goldenrod", checks: { items: { 477: 1 } } },
  // Goldenrod's north gate (map 101), Route 35 (map 39) and its trainers, the park's gate (102), into the National Park (96).
  { n: 38, name: "Rota 35 até o National Park", checks: { map: 96 } },
  // The park's trainers, then its east gate (104) to Route 36 (map 40), its trainers west of the Sudowoodo.
  { n: 39, name: "National Park até a Rota 36", checks: { map: 40 } },
  // 243:0, the Sudowoodo (person 4 at (415, 246)): the SquirtBottle, "yes", then the wild battle (species 185, level 20) fought
  // by the bot; the map's onLoad (243:10) sees flag 164 and sets 450, which hides it. Flag 181, then the girl's gifts (std 2033):
  // item 470, and three each of items 155 and 151; flag 463 hides her.
  { n: 40, name: "Sudowoodo vencido", checks: { map: 40, flags: [181, 450, 463], items: { 470: 1, 155: 3, 151: 3 } } },
  // Through the Sudowoodo's tile and east along Route 36 to its Violet gate (map 149).
  { n: 41, name: "Rota 36 livre até o portão de Violet", checks: { map: 149 } },
  // Spec 031.1. Route 37 (map 41) north into Ecruteak City (map 78).
  { n: 42, name: "Rota 37 até Ecruteak", checks: { map: 78 } },
  // Ecruteak's north door (376, 149) into the Burned Tower 1F (map 7); the trigger at (19, 23) (23:0, VAR 0x40A2 = 0): Eusine
  // walks up and talks (0x40A2 = 1).
  { n: 43, name: "Eusine na Burned Tower", checks: { map: 7, vars: { 0x40a2: 1 } } },
  // The trigger at (22, 19) (23:3, VAR 0x40A6 = 0): the rival by the player's starter (267 Chikorita, 270 Cyndaquil, 263
  // Totodile), then flag 454 hides him and 0x40A6 = 1.
  { n: 44, name: "Rival na Burned Tower", checks: { map: 7, flags: [454], vars: { 0x40a6: 1 }, beaten: [267, 270, 263] } },
  // Down the hole at (22, 16) into B1F (map 217), the trigger at (20, 16–17) (24:0, VAR 0x40A1 = 0): the three beasts wake
  // and flee (457–459), Eusine shows and leaves (456), Morty (460) and Eusine (455) leave 1F; 0x40A1 = 1, 0x4076 = 1, 0x4079 = 2.
  { n: 45, name: "Despertar dos cães lendários", checks: { map: 217, flags: [455, 456, 457, 458, 459, 460], vars: { 0x40a1: 1, 0x4076: 1, 0x4079: 2 } } },
  // Item 031.3. Ecruteak's gym door (376, 183) into the gym (map 80, at (16, 49)): the path over the void, where every walkable
  // tile beside it is a trigger (922:2) that spins the player and warps them back to (16, 49); its trainers (persons 2–5).
  { n: 46, name: "Ginásio de Ecruteak: caminho invisível até o Morty", checks: { map: 80 } },
  // 922:1, Morty (person 1, trainer 31): the Fog Badge (badge 3), flag 2456, then TM30 (item 357, std 2033) and flag 166.
  { n: 47, name: "Morty vencido e Insígnia Fog", checks: { badges: 4, flags: [2456, 166], items: { 357: 1 }, beaten: [31] } },
  // Item 031.5. Route 39's south end (x 277–281) into Olivine City (map 77).
  { n: 48, name: "Rota 39 até Olivine", checks: { map: 77 } },
  // 911:1, the trigger at (272, 239–243) on the way west to the gym (VAR 0x4078 = 0): the rival comes out of the gym, talks
  // and leaves; 0x4078 = 1, flag 470 hides him.
  { n: 49, name: "Rival em Olivine", checks: { map: 77, vars: { 0x4078: 1 }, flags: [470] } },
  // The lighthouse door (301, 263) into 1F (map 115); its trainers floor by floor (maps 220, 222, 223, 224); then the elevator
  // (map 446, scr_seq 67): floor 0 sets the dynamic warp to 6F (map 225), and its door leads there.
  { n: 50, name: "Farol: treinadores e elevador até o 6F", checks: { map: 225 } },
  // 66:0, Jasmine (person 1 of map 225): without the SecretPotion (flag 185) she asks for it; VAR 0x40A5 = 1, flag 472.
  { n: 51, name: "Jasmine pede o remédio do Amphy", checks: { map: 225, vars: { 0x40a5: 1 }, flags: [472] } },
  // Item 031.6. The Dance Theater (map 86): its frame (0x410C = 0) brings the Rocket on; beaten (trainer 601) he leaves (570),
  // and the trigger at (3, 8) (928:11, 0x410C = 2) has the gentleman hand over HM03 (item 422, flag 162); 0x410C = 3.
  { n: 52, name: "Teatro de Ecruteak: Rocket e HM03", checks: { map: 86, items: { 422: 1 }, flags: [162, 570], vars: { 0x410c: 3 }, beaten: [601] } },
  // A Sentret taught Surf; from Route 40's beach across Routes 40 and 41 (map 95) by water, a whirlpool still in the way,
  // onto Cianwood's beach (map 75).
  { n: 53, name: "Surf pelas Rotas 40 e 41 até Cianwood", checks: { map: 75 } },
  // 875:2, the trigger at (176, 334) (0x4076 = 1): Suicune flees (481, 0x4076 = 2), Eusine (trainer 498) battles and
  // leaves (482); 0x4092 = 1.
  { n: 54, name: "Suicune e Eusine em Cianwood", checks: { map: 75, flags: [481, 482], vars: { 0x4076: 2, 0x4092: 1 }, beaten: [498] } },
  // 877:0, Chuck (person 0 of map 139, trainer 34) once the winch stopped the waterfall: the Storm Badge (badge 4), then
  // TM01 (item 328, flag 186).
  { n: 55, name: "Chuck vencido e Insígnia Storm", checks: { badges: 5, flags: [186], items: { 328: 1 }, beaten: [34] } },
  // Out of the gym, Chuck's wife (875:6, 0x4116 = 1): HM02 (item 421, flag 187). The pharmacy (map 233, 881:0): with
  // Jasmine's request (0x40A5 = 1) the SecretPotion (item 464, flag 185).
  { n: 56, name: "Remédio da farmácia de Cianwood", checks: { map: 233, items: { 464: 1, 421: 1 }, flags: [185, 187] } },
];
