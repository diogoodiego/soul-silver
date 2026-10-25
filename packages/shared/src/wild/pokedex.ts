/** A player's Pokédex as the save stores it (spec 015). Both return whether anything changed. */
export interface Pokedex {
  seen: number[];
  caught: number[];
}

export function markSeen(dex: Pokedex, species: number): boolean {
  if (dex.seen.includes(species)) return false;
  dex.seen.push(species);
  return true;
}

export function markCaught(dex: Pokedex, species: number): boolean {
  markSeen(dex, species);
  if (dex.caught.includes(species)) return false;
  dex.caught.push(species);
  return true;
}
