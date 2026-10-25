// The Gen 4 type chart, written by hand from the rules (not from the ROM) to check both the
// extraction and the effectiveness function. Type ids are the game's: 9 is "???".

export const T = {
  normal: 0, fighting: 1, flying: 2, poison: 3, ground: 4, rock: 5, bug: 6, ghost: 7, steel: 8,
  unknown: 9, fire: 10, water: 11, grass: 12, electric: 13, psychic: 14, ice: 15, dragon: 16, dark: 17,
} as const;

type Name = keyof typeof T;
const rows: Record<Exclude<Name, "unknown">, { super?: Name[]; half?: Name[]; immune?: Name[] }> = {
  normal: { half: ["rock", "steel"], immune: ["ghost"] },
  fighting: { super: ["normal", "rock", "steel", "ice", "dark"], half: ["flying", "poison", "bug", "psychic"], immune: ["ghost"] },
  flying: { super: ["fighting", "bug", "grass"], half: ["rock", "steel", "electric"] },
  poison: { super: ["grass"], half: ["poison", "ground", "rock", "ghost"], immune: ["steel"] },
  ground: { super: ["poison", "rock", "steel", "fire", "electric"], half: ["bug", "grass"], immune: ["flying"] },
  rock: { super: ["flying", "bug", "fire", "ice"], half: ["fighting", "ground", "steel"] },
  bug: { super: ["grass", "psychic", "dark"], half: ["fighting", "flying", "poison", "ghost", "steel", "fire"] },
  ghost: { super: ["ghost", "psychic"], half: ["steel", "dark"], immune: ["normal"] },
  steel: { super: ["rock", "ice"], half: ["steel", "fire", "water", "electric"] },
  fire: { super: ["bug", "steel", "grass", "ice"], half: ["rock", "fire", "water", "dragon"] },
  water: { super: ["ground", "rock", "fire"], half: ["water", "grass", "dragon"] },
  grass: { super: ["ground", "rock", "water"], half: ["flying", "poison", "bug", "steel", "fire", "grass", "dragon"] },
  electric: { super: ["flying", "water"], half: ["grass", "electric", "dragon"], immune: ["ground"] },
  psychic: { super: ["fighting", "poison"], half: ["steel", "psychic"], immune: ["dark"] },
  ice: { super: ["flying", "ground", "grass", "dragon"], half: ["steel", "fire", "water", "ice"] },
  dragon: { super: ["dragon"], half: ["steel"] },
  dark: { super: ["ghost", "psychic"], half: ["fighting", "steel", "dark"] },
};

/** In the extracted format: one record per attacking type, multipliers in tenths. */
export const GEN4_CHART = Array.from({ length: 18 }, (_, attacker) => {
  const name = (Object.keys(T) as Name[]).find((n) => T[n] === attacker)!;
  const row = name === "unknown" ? {} : rows[name];
  const against: (0 | 5 | 10 | 20)[] = Array.from({ length: 18 }, () => 10);
  for (const n of row.super ?? []) against[T[n]] = 20;
  for (const n of row.half ?? []) against[T[n]] = 5;
  for (const n of row.immune ?? []) against[T[n]] = 0;
  return { id: attacker, against };
});
