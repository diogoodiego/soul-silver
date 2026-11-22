/** The Gym Leaders in badge order, Johto then Kanto: the trainer of the story's fight and its map sprite (the person in its gym). */
export const GYM_LEADERS: ReadonlyMap<number, { sprite: number }> = new Map([
  [20, { sprite: 352 }], // Falkner
  [21, { sprite: 353 }], // Bugsy
  [30, { sprite: 354 }], // Whitney
  [31, { sprite: 355 }], // Morty
  [34, { sprite: 356 }], // Chuck
  [33, { sprite: 357 }], // Jasmine
  [32, { sprite: 358 }], // Pryce
  [35, { sprite: 359 }], // Clair
  [253, { sprite: 373 }], // Brock
  [254, { sprite: 370 }], // Misty
  [255, { sprite: 368 }], // Lt. Surge
  [256, { sprite: 371 }], // Erika
  [257, { sprite: 372 }], // Janine
  [258, { sprite: 369 }], // Sabrina
  [259, { sprite: 374 }], // Blaine
  [261, { sprite: 375 }], // Blue
]);

/** Trainers whose last Pokémon is a boss: the Gym Leaders, the Elite Four and the Champion, these in both their story and rematch fights. */
export const BOSS_TRAINERS: ReadonlySet<number> = new Set([
  ...GYM_LEADERS.keys(),
  ...[245, 702], // Will
  ...[247, 703], // Koga
  ...[418, 704], // Bruno
  ...[246, 705], // Karen
  ...[244, 701], // Lance
]);
