// Where each piece of game data lives in the accepted ROM. The ROM is locked by hash, so the
// offsets are fixed; every table read from code is also checked structurally (research R10).
// See specs/004-game-data-extraction/research.md R1, R3 and R10.

export interface FormLayout {
  /** Member of the personal NARC. */
  personalIndex: number;
  /** National Pokédex number of the base species. */
  species: number;
  /** Form number, 1 or more. */
  form: number;
}

export interface DataLayout {
  /** NARC paths relative to the `narc` output of `rom-unpack`, e.g. "a/0/0/2". */
  narc: {
    personal: string;
    moves: string;
    levelUp: string;
    evolutions: string;
    eggMoves: string;
    items: string;
    growth: string;
    messages: string;
  };
  /** Member of the messages NARC holding the ability names; only its entry count is read. */
  abilityNameBank: number;
  /** Path relative to the `filesystem` output of `rom-unpack`. */
  tutorCompatFile: string;
  /** Offsets inside the decompressed ARM9. */
  arm9: { natures: number; machines: number; itemMap: number };
  /** Overlay number and offset inside the decompressed overlay. */
  overlay: {
    typeChart: { overlay: number; offset: number };
    tutors: { overlay: number; offset: number };
  };
  counts: {
    species: number;
    moves: number;
    /** Highest item id; ids run 1..items. */
    items: number;
    machines: number;
    tutors: number;
    tutorCompatEntries: number;
    natures: number;
    types: number;
    growthRates: number;
  };
  forms: readonly FormLayout[];
}

export const SOULSILVER_US_LAYOUT: DataLayout = {
  narc: {
    personal: "a/0/0/2",
    moves: "a/0/1/1",
    levelUp: "a/0/3/3",
    evolutions: "a/0/3/4",
    eggMoves: "a/2/2/9",
    items: "a/0/1/7",
    growth: "a/0/0/3",
    messages: "a/0/2/7",
  },
  abilityNameBank: 720,
  tutorCompatFile: "fielddata/wazaoshie/waza_oshie.bin",
  arm9: { natures: 0xff639, machines: 0x1000cc, itemMap: 0x100194 },
  overlay: {
    typeChart: { overlay: 12, offset: 0x353bc },
    tutors: { overlay: 1, offset: 0x23ae0 },
  },
  counts: {
    species: 493,
    moves: 467,
    items: 536,
    machines: 100,
    tutors: 52,
    tutorCompatEntries: 505,
    natures: 25,
    types: 18,
    growthRates: 6,
  },
  forms: [
    { personalIndex: 496, species: 386, form: 1 },
    { personalIndex: 497, species: 386, form: 2 },
    { personalIndex: 498, species: 386, form: 3 },
    { personalIndex: 499, species: 413, form: 1 },
    { personalIndex: 500, species: 413, form: 2 },
    { personalIndex: 501, species: 487, form: 1 },
    { personalIndex: 502, species: 492, form: 1 },
    { personalIndex: 503, species: 479, form: 1 },
    { personalIndex: 504, species: 479, form: 2 },
    { personalIndex: 505, species: 479, form: 3 },
    { personalIndex: 506, species: 479, form: 4 },
    { personalIndex: 507, species: 479, form: 5 },
  ],
};
